# Notification System Design

## Stage 1

### REST API Endpoints

#### 1. Get Notifications for a Student
```
GET /api/notifications?studentId={id}&page=1&limit=20
Authorization: Bearer <token>

Response 200:
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement" | "Result" | "Event",
      "message": "string",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:30Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

#### 2. Mark Notification as Read
```
PATCH /api/notifications/:id/read
Authorization: Bearer <token>

Response 200:
{ "message": "Notification marked as read" }
```

#### 3. Mark All as Read
```
PATCH /api/notifications/read-all?studentId={id}
Authorization: Bearer <token>

Response 200:
{ "message": "All notifications marked as read" }
```

#### 4. Create Notification (Admin)
```
POST /api/notifications
Authorization: Bearer <token>

Body:
{
  "studentIds": ["id1", "id2"],
  "type": "Placement",
  "message": "Google hiring drive tomorrow"
}

Response 201:
{ "message": "Notifications queued for delivery" }
```

#### 5. Delete Notification
```
DELETE /api/notifications/:id
Authorization: Bearer <token>

Response 200:
{ "message": "Notification deleted" }
```

### Real-Time Notification Mechanism

Use **Server-Sent Events (SSE)**:
```
GET /api/notifications/stream?studentId={id}
Authorization: Bearer <token>
```
- Server keeps connection open
- Pushes events when new notifications arrive
- Lightweight, works over HTTP, no extra libraries needed
- Client reconnects automatically if connection drops

---

## Stage 2

### Database Choice: PostgreSQL

**Why PostgreSQL:**
- Strong ACID compliance for notification delivery guarantees
- Excellent support for enums (notification types)
- Rich indexing options (partial indexes, composite indexes)
- JSON support for flexible metadata

### Schema

```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  roll_no VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_student_id ON notifications(student_id);
CREATE INDEX idx_notifications_student_unread 
  ON notifications(student_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
```

### Problems as Data Volume Increases & Solutions

| Problem | Solution |
|---------|----------|
| Table too large, queries slow | Partition by `created_at` (monthly) |
| Too many unread notifications | Partial index on `WHERE is_read = FALSE` |
| Read replica lag | Use read replicas for GET, primary for writes |
| Connection pool exhaustion | Use PgBouncer connection pooler |

### Key Queries

```sql
-- Get unread notifications for a student (paginated)
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;

-- Mark as read
UPDATE notifications
SET is_read = TRUE
WHERE id = $1 AND student_id = $2;

-- Count unread
SELECT COUNT(*) FROM notifications
WHERE student_id = $1 AND is_read = FALSE;
```

---

## Stage 3

### Query Analysis

**Original Query:**
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

**Problems:**
1. `SELECT *` fetches all columns including large `message` text — wasteful
2. No index on `(studentID, isRead)` — full table scan on 5M rows
3. `ORDER BY createdAt DESC` without index causes filesort
4. Integer studentID is inconsistent with UUID design (minor)

**Computation Cost:** O(N) full table scan = very slow at 5M rows

### Is "Index Every Column" Good Advice? NO

Indexing every column is harmful:
- Every INSERT/UPDATE must update all indexes — writes become very slow
- Indexes consume disk space (can be larger than the table itself)
- PostgreSQL query planner can get confused with too many indexes
- Composite indexes are far more effective than individual column indexes

### Fix

```sql
-- Add targeted composite index
CREATE INDEX idx_notifications_student_unread 
  ON notifications(student_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

-- Fixed query
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = FALSE
ORDER BY created_at DESC;
```

### Find Students with Placement Notification in Last 7 Days

```sql
SELECT DISTINCT s.id, s.name, s.email, s.roll_no
FROM students s
JOIN notifications n ON s.id = n.student_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

---

## Stage 4

### Performance Problem
Fetching notifications on every page load for 50,000 students causes:
- Massive DB load (N queries per second)
- High latency for users
- Risk of DB crash under peak load

### Solution: Multi-Layer Caching with Redis

**Architecture:**
```
Client → API Server → Redis Cache → PostgreSQL (only on cache miss)
```

**Strategy:**

1. **Cache unread count** (TTL: 30 seconds)
   - Key: `unread_count:{student_id}`
   - Invalidate on: new notification, mark-as-read

2. **Cache notification page** (TTL: 60 seconds)
   - Key: `notifications:{student_id}:page:{n}`
   - Invalidate on: new notification for that student

3. **Cache invalidation on write:**
   - When new notification is created → delete `notifications:{student_id}:*`
   - When notification marked read → update or delete relevant cache keys

**Tradeoffs:**
- Eventual consistency: user may see slightly stale count (acceptable)
- Memory cost: Redis memory grows with user base (manageable)
- Complexity: need cache invalidation logic

---

## Stage 5

### Shortcomings of Original Implementation

```
function notify_all(student_ids, message):
  for student_id in student_ids:
    send_email(student_id, message)   # synchronous, blocks loop
    save_to_db(student_id, message)   # if email fails, DB may still save
    push_to_app(student_id, message)  # all three coupled together
```

**Problems:**
1. **Synchronous loop** — 50,000 iterations, extremely slow (minutes)
2. **No error recovery** — if email fails at item 200, remaining 49,800 are skipped
3. **Tight coupling** — email, DB, and push are all in one transaction
4. **No retry mechanism** — failed emails are lost permanently
5. **DB and email should NOT be coupled** — DB save should not depend on email success

### Should DB save and email happen together? NO
- DB save should happen first, always (source of truth)
- Email is a side effect that can fail and be retried
- Coupling them means a failed email can cause a missed DB record

### Redesigned Solution: Message Queue

```
function notify_all(student_ids, message):
  # Step 1: Save all to DB first (bulk insert — fast)
  bulk_insert_to_db(student_ids, message)
  
  # Step 2: Enqueue jobs for email + push (non-blocking)
  for student_id in student_ids:
    queue.enqueue("send_email_job", {student_id, message}, retry=3)
    queue.enqueue("push_notification_job", {student_id, message}, retry=3)
  
  return "Notifications queued"

# Worker processes jobs independently
function send_email_job(student_id, message):
  try:
    send_email(student_id, message)
    mark_email_sent_in_db(student_id)
  except EmailFailure:
    # Auto-retried by queue up to 3 times
    # After 3 fails → move to dead letter queue for manual review
    raise
```

**Benefits:**
- DB save is instant (bulk insert)
- Emails processed in parallel by multiple workers
- Failed emails retried automatically up to N times
- Dead letter queue captures permanently failed emails for review
- System stays responsive during entire operation

---

## Stage 6

### Priority Inbox Approach

**Priority Formula:**
```
score = (type_weight × 10) + (recency_score × 5)

type_weight:
  Placement = 3  (highest)
  Result    = 2
  Event     = 1  (lowest)

recency_score = e^(-age_in_hours / 24)
  → 1.0 if just now
  → 0.37 if 24 hours ago
  → ~0 if very old
```

**Maintaining Top-10 Efficiently as New Notifications Arrive:**
- Use a **Min-Heap of size N**
- When new notification arrives: score it, if score > heap minimum → replace minimum
- This gives O(log N) insertion instead of O(M log M) full re-sort
- Never need to re-process all notifications

See `notification_app_be/priorityInbox.js` for implementation.