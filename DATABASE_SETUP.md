# CodeTrack Atlas And Vercel Setup

CodeTrack now uses a Node.js + Express backend backed by MongoDB Atlas. The same `/api` endpoints work for local development and for deployment on Vercel.

## 1. Configure MongoDB Atlas

Create or use an Atlas cluster, then copy its connection string.

Required environment variables:

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/codetrack?retryWrites=true&w=majority&appName=CodeTrack
MONGODB_DB=codetrack
PORT=3000
```

Reference file: [.env.example](/Users/yashgupta/Documents/CodeTrack/.env.example)

## 2. Run locally

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

The server will connect to Atlas, create indexes automatically, and seed sample data when the database is empty.

## 3. Deploy to Vercel

This project already includes `api/index.js` and `vercel.json` for the Vercel serverless entrypoint.

Add these Environment Variables in the Vercel project settings:

```bash
MONGODB_URI
MONGODB_DB
```

Do not upload your local `.env` file to Vercel. Keep local secrets in `.env`, and set the same values again in the Vercel dashboard under Project Settings -> Environment Variables.

Recommended Vercel settings:

- Framework Preset: `Other`
- Root Directory: project root
- Node.js runtime: `20.x`

After deployment, Vercel will serve the static frontend pages and forward all `/api/*` requests to the backend function.

## 4. Local notes

- Local development reads environment values from `.env` automatically.
- Vercel does not use your local `.env` file from the repository; it uses the variables configured in the project dashboard.

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

Passwords are still stored directly in MongoDB in this version. That is acceptable for a demo or classroom project, but not for production-grade authentication.
