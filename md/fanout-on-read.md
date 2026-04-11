# Fan-out on Read vs Fan-out on Write

A core pattern in distributed systems for handling social feeds (Twitter, Instagram, TikTok).

## The Problem

**You build a Twitter-like app.** Users follow accounts and see a feed of their posts.

```
User A follows:    B, C, D, E, F
User B follows:    A, C
User C follows:    A, B, D

When A tweets:
  Who needs to see it?
  → B's timeline
  → C's timeline
  → ... plus millions more followers
```

How do you make B's timeline load in **milliseconds** when A tweets?

---

## Solution 1: Fan-out on Write

**Push the tweet to all followers when it's written.**

### How It Works

```
A tweets "Hello world"
  ↓
1. Save tweet to database
2. Get all followers of A (let's say 1M)
3. For each follower, PUSH tweet to their Redis timeline cache
   - B's Redis timeline ← add A's tweet
   - C's Redis timeline ← add A's tweet
   - ... (1M pushes)
4. Return to A immediately

When B reads their timeline:
  ↓
1. Query Redis: "Give me B's timeline"
2. Redis returns pre-built list (already contains A's tweet)
3. Done in microseconds
```

### Pseudocode

```python
def A_posts_tweet(tweet_content):
    # Save to database
    db.insert("tweets", {
        "user_id": A,
        "content": tweet_content,
        "timestamp": now
    })

    # Get all followers
    followers = db.query("SELECT follower_id FROM follows WHERE user_id = A")

    # Push tweet to each follower's cache
    for follower_id in followers:
        redis.lpush(f"timeline:{follower_id}", {
            "user": A,
            "content": tweet_content,
            "timestamp": now
        })

def B_reads_timeline():
    # Just read from Redis
    timeline = redis.lrange(f"timeline:{B}", 0, 50)
    return timeline
```

### Trade-offs

**Pros:**
- Read is blazingly fast (microseconds)
- No query parsing, just grab from cache
- Simple logic

**Cons:**
- Write is expensive (1M Redis writes for 1M followers)
- If A has 80M followers, ONE tweet = 80M Redis operations
- Can cascade and overload the database during viral moments

---

## Solution 2: Fan-out on Read

**Don't push. Merge on-demand when user reads.**

### How It Works

```
A tweets "Hello world"
  ↓
1. Save tweet to database
2. That's it. Go home.

When B reads their timeline:
  ↓
1. Query Redis: "Give me my pre-built timeline"
   (contains tweets from regular people I follow: C, D, E, F)
2. Query Database: "Give me latest tweets from celebrities I follow"
   (A is a celebrity, fetch their recent tweets)
3. Merge both lists by timestamp
4. Return combined timeline
```

### Pseudocode

```python
def A_posts_tweet(tweet_content):
    # Just save to database
    db.insert("tweets", {
        "user_id": A,
        "content": tweet_content,
        "timestamp": now
    })
    # THAT'S IT. No Redis pushes.

def B_reads_timeline():
    # Get pre-built timeline from Redis (regular follows)
    regular_timeline = redis.lrange(f"timeline:{B}", 0, 50)

    # Get celebrity tweets from database (expensive, but A is a celebrity)
    my_celebrity_follows = db.query(
        "SELECT user_id FROM follows
         WHERE follower_id = B AND user_id IN (select user_id from users where follower_count > 1M)"
    )
    celebrity_tweets = db.query(
        f"SELECT * FROM tweets
         WHERE user_id IN ({my_celebrity_follows})
         ORDER BY timestamp DESC LIMIT 20"
    )

    # Merge and return
    return merge_and_sort(regular_timeline, celebrity_tweets)
```

### Trade-offs

**Pros:**
- Write is cheap (one database insert)
- No write amplification
- Scales with celebrity accounts

**Cons:**
- Read is more expensive (query database + merge)
- Slightly higher latency (milliseconds instead of microseconds)
- More complex logic
- Database needs indexing on (user_id, timestamp)

---

## When to Use Which

### Use Fan-out on Write:

- Most followers have **few followers** (< 10K)
- Read latency is critical (microseconds required)
- Write volume is moderate
- Most accounts have balanced follower counts

**Example:** Personal Twitter account with 5K followers

### Use Fan-out on Read:

- You have **celebrity accounts** (100K+ followers)
- Write spike tolerance is high
- Read latency tolerance is higher (milliseconds OK)
- Unpredictable viral moments

**Example:** Elon tweets, accounts with millions of followers

---

## Twitter's Real Solution: Hybrid

Twitter doesn't pick one. They do **both**:

```
Regular users (< 10K followers):
  → Fan-out on write
  → Push tweet to all followers' Redis

Celebrity users (> 10K followers):
  → Fan-out on read
  → Just save to database
  → Merge on read

When you open Twitter:
  → Your timeline = pre-built Redis cache (from regular accounts)
              + real-time DB queries (from celebrities)
```

---

## Real-World Numbers

**A regular user (10K followers) tweets:**
- Fan-out on write cost: 10K Redis writes (acceptable)
- Read cost: Microseconds

**A celebrity (80M followers) tweets:**
- Fan-out on write cost: 80M Redis writes (unacceptable, would crash Redis)
- Fan-out on read cost: One DB write + merge on each of 80M reads (spread over hours)

The key insight: **You pay at different times.** With celebrities, you pay per reader over time instead of per follower at write time.

---

## Implementation Checklist

If building this system:

```
☐ Identify what counts as "celebrity" (follower threshold)
☐ Mark accounts as "high_follower_count" in database
☐ On write: Check this flag
  ☐ If false: Fan-out on write to Redis
  ☐ If true: Just save to database
☐ On read:
  ☐ Pull regular timeline from Redis
  ☐ Query database for celebrity accounts
  ☐ Merge by timestamp
☐ Index: CREATE INDEX on tweets(user_id, timestamp)
☐ Cache the merge result briefly (to avoid repeated merges)
```
