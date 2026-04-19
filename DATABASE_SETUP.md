# CodeTrack Database Setup

CodeTrack now uses a Node.js + Express backend with MongoDB for storage.

## 1. Start MongoDB

Run MongoDB locally, or use a MongoDB Atlas connection string.

Local default:

```bash
mongodb://127.0.0.1:27017
```

## 2. Configure the database connection

Set these environment variables before running the server:

```bash
export MONGODB_URI=mongodb://127.0.0.1:27017
export MONGODB_DB=codetrack
export PORT=3000
```

You can also use [.env.example](/Users/yashgupta/Documents/New%20project/.env.example) as your reference.

## 3. Install dependencies

```bash
npm install
```

## 4. Start the application

```bash
npm start
```

The app will connect to MongoDB, create indexes automatically, and seed sample exercise/submission data if the database is empty.

## Collections Used

- `users`
- `login_events`
- `contact_messages`
- `exercises`
- `submissions`
- `review_comments`
- `progress_comments`
- `progress_comment_reads`
- `notifications`
- `activity_logs`
- `counters`

## Important

Passwords are stored directly in MongoDB in this version, so this is suitable for a classroom/demo project, not production authentication.
