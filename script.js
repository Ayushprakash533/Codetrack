(function () {
  const API_BASE = (() => {
    const { protocol, hostname, port } = window.location;
    const isLocalStaticPreview =
      (hostname === "127.0.0.1" || hostname === "localhost") &&
      port &&
      port !== "3000";

    // Static previews run on a different port than the Express API during local development.
    if (isLocalStaticPreview) {
      return `${protocol}//${hostname}:3000/api`;
    }

    return "/api";
  })();
  const $ = (id) => document.getElementById(id);
  const normalizeRole = (role = "") => role === "teacher" ? "pro" : role === "student" ? "user" : role;
  const fmtDate = (ts) =>
    new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  const escapeHTML = (str = "") =>
    str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sameId = (a, b) => String(a) === String(b);

  let state = { exercises: [], submissions: [], progressComments: [], progressCommentReads: [] };
  let sortMode = "newest";
  let pendingReadMark = false;
  let statePollId = null;
  const reviewDrafts = new Map();

  function currentRole() {
    return normalizeRole(localStorage.getItem("codetrack_user_role") || "");
  }

  function currentEmail() {
    return (localStorage.getItem("codetrack_user_email") || "").toLowerCase();
  }

  function currentUserName() {
    return localStorage.getItem("codetrack_user_name") || "";
  }

  function toast(message, isError = false) {
    let el = $("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = isError ? "toast error" : "toast";
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => el.classList.remove("show"), 3200);
  }

  async function api(path, options = {}) {
    const email = currentEmail();
    const role = currentRole();
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(email ? { "X-CodeTrack-Email": email } : {}),
        ...(role ? { "X-CodeTrack-Role": role } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      let message = "Request failed";
      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch (_err) {
        const text = await response.text();
        if (text) message = text;
      }
      throw new Error(message);
    }

    return response.json();
  }

  async function fetchState() {
    state = await api("/state");
  }

  function progressUnreadCount() {
    const email = currentEmail();
    if (currentRole() !== "user" || !email) return 0;
    // Read state is tracked separately so teacher comments can stay unread
    // without mutating the comment documents themselves.
    const readIds = new Set(
      (state.progressCommentReads || [])
        .filter((item) => item.studentEmail === email)
        .map((item) => item.commentId)
    );
    return (state.progressComments || []).filter(
      (comment) => comment.studentEmail === email && comment.authorRole === "pro" && !readIds.has(comment.id)
    ).length;
  }

  function renderProgressBadge() {
    const unread = progressUnreadCount();
    document.querySelectorAll("a[href='progress.html']").forEach((link) => {
      let badge = link.querySelector(".notif-badge");
      if (!badge && unread > 0) {
        badge = document.createElement("span");
        badge.className = "notif-badge";
        link.appendChild(badge);
      }
      if (badge) {
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.classList.toggle("hidden", unread === 0);
      }
    });
  }

  function summaryStats() {
    const exCount = state.exercises.length;
    const subCount = state.submissions.length;
    const attemptsByExercise = state.exercises.map((exercise) =>
      state.submissions.filter((submission) => sameId(submission.exerciseId, exercise.id)).length
    );
    const avgAttempts = attemptsByExercise.length
      ? (attemptsByExercise.reduce((sum, count) => sum + count, 0) / attemptsByExercise.length).toFixed(1)
      : 0;
    return { exCount, subCount, avgAttempts };
  }

  function renderStats() {
    if (!$("statExercises") || !$("statSubmissions") || !$("statAttempts")) return;
    const { exCount, subCount, avgAttempts } = summaryStats();
    $("statExercises").textContent = exCount;
    $("statSubmissions").textContent = subCount;
    $("statAttempts").textContent = avgAttempts;
  }

  function renderExerciseOptions() {
    const selects = [$("exerciseSelect"), $("reviewExerciseFilter"), $("progressExercise")];
    selects.forEach((select) => {
      if (!select) return;
      const previousValue = select.value;
      select.innerHTML = "";

      if (select.id !== "exerciseSelect") {
        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = select.id === "progressExercise" ? "All exercises" : "All";
        select.appendChild(allOption);
      }

      state.exercises.forEach((exercise) => {
        const option = document.createElement("option");
        option.value = exercise.id;
        option.textContent = `${exercise.title} (${exercise.language})`;
        select.appendChild(option);
      });

      if ([...select.options].some((option) => option.value === previousValue)) {
        select.value = previousValue;
      }
    });
  }

  function renderStudentsOptions() {
    const select = $("progressStudent");
    if (!select) return;

    const previousValue = select.value;
    select.innerHTML = "";

    const uniqueEmails = Array.from(new Set(state.submissions.map((submission) => submission.studentEmail)));
    if (!uniqueEmails.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No submissions yet";
      select.appendChild(option);
      return;
    }

    const loggedInEmail = currentEmail();
    const isStudent = currentRole() === "user";
    const filteredEmails = isStudent && loggedInEmail ? uniqueEmails.filter(email => email === loggedInEmail) : uniqueEmails;

    filteredEmails.forEach((email) => {
      const option = document.createElement("option");
      option.value = email;
      const name = state.submissions.find((submission) => submission.studentEmail === email)?.studentName || email;
      option.textContent = `${name} (${email})`;
      select.appendChild(option);
    });

    if (isStudent && loggedInEmail && [...select.options].some((option) => option.value === loggedInEmail)) {
      select.value = loggedInEmail;
      select.disabled = true;
    } else {
      select.disabled = false;
    }

    if (!select.disabled && [...select.options].some((option) => option.value === previousValue)) {
      select.value = previousValue;
    }
  }

  function renderQueue() {
    const queueList = $("queueList");
    const queueMeta = $("queueMeta");
    if (!queueList || !queueMeta) return;
    const pending = state.submissions
      .filter((submission) => !Array.isArray(submission.reviews) || submission.reviews.length === 0)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4);

    if (!pending.length) {
      queueList.innerHTML = '<div class="empty">No submissions waiting for review.</div>';
      queueMeta.textContent = "Instructor queue is clear.";
      return;
    }

    queueList.innerHTML = pending
      .map((submission) => {
        const exercise = state.exercises.find((item) => sameId(item.id, submission.exerciseId));
        return `<button class="queue-card" data-jump="${submission.id}" type="button">
          <div class="queue-title">${escapeHTML(exercise ? exercise.title : "Exercise")}</div>
          <div class="queue-meta">${escapeHTML(submission.studentName)} • Attempt ${submission.attempt}</div>
          <div class="pill ghost small">${fmtDate(submission.createdAt)}</div>
        </button>`;
      })
      .join("");

    queueMeta.textContent = `${pending.length} waiting for instructor feedback`;
  }

  function renderExercises() {
    const list = $("exerciseList");
    if (!list) return;
    const sorted = [...state.exercises].sort((a, b) => {
      if (sortMode === "popular") {
        const countA = state.submissions.filter((submission) => sameId(submission.exerciseId, a.id)).length;
        const countB = state.submissions.filter((submission) => sameId(submission.exerciseId, b.id)).length;
        return countB - countA || b.createdAt - a.createdAt;
      }
      return b.createdAt - a.createdAt;
    });

    list.innerHTML =
      sorted
        .map((exercise) => {
          const submissions = state.submissions.filter((submission) => sameId(submission.exerciseId, exercise.id));
          const pendingFeedback = submissions.filter((submission) => !Array.isArray(submission.reviews) || submission.reviews.length === 0).length;
          const reviewed = submissions.filter((submission) => Array.isArray(submission.reviews) && submission.reviews.length > 0).length;

          return `<article class="card compact">
            <div class="card-row">
              <div>
                <h3>${escapeHTML(exercise.title)}</h3>
                <p class="muted">${escapeHTML(exercise.prompt)}</p>
              </div>
              <div class="meta-block">
                <div class="pill ghost">${escapeHTML(exercise.language)}</div>
                <div class="pill ghost">${escapeHTML(exercise.difficulty)}</div>
              </div>
            </div>
            <div class="meta-row">
              <span>${submissions.length} submissions</span>
              <span>${pendingFeedback} awaiting feedback</span>
              <span>${reviewed} reviewed</span>
              <span>${fmtDate(exercise.createdAt)}</span>
            </div>
          </article>`;
        })
        .join("") || '<div class="empty">Publish the first exercise to open the workflow.</div>';
  }

  function calcDelta(submission) {
    // Compare only against the student's previous attempt for the same exercise,
    // which keeps progress labels meaningful across multiple exercises.
    const previous = state.submissions
      .filter(
        (item) =>
          sameId(item.exerciseId, submission.exerciseId) &&
          item.studentEmail === submission.studentEmail &&
          item.createdAt < submission.createdAt
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!previous) return 0;
    return submission.score - previous.score;
  }

  function getReviewDraft(submission) {
    const draft = reviewDrafts.get(String(submission.id));
    if (!draft) {
      return {
        score: submission.score ?? "",
        comment: submission.latestComment || ""
      };
    }

    return {
      score: draft.score ?? (submission.score ?? ""),
      comment: draft.comment ?? (submission.latestComment || "")
    };
  }

  function setReviewDraftValue(id, field, value) {
    const key = String(id || "");
    if (!key) return;
    const draft = reviewDrafts.get(key) || {};
    draft[field] = value;
    reviewDrafts.set(key, draft);
  }

  function clearReviewDraft(id) {
    reviewDrafts.delete(String(id));
  }

  function renderReviewHistory(submission) {
    const reviews = Array.isArray(submission.reviews) ? [...submission.reviews].sort((a, b) => b.createdAt - a.createdAt) : [];
    if (!reviews.length) {
      return '<div class="review-history empty">No instructor comments yet.</div>';
    }

    return `<div class="review-history">${reviews
      .map(
        (review) => `<div class="review-note">
          <div class="meta-row space">
            <strong>Instructor feedback</strong>
            <span class="muted">${fmtDate(review.createdAt)}</span>
          </div>
          <p>${escapeHTML(review.comment || "Feedback saved without a written comment.")}</p>
        </div>`
      )
      .join("")}</div>`;
  }

  function renderSubmissions() {
    const container = $("submissionList");
    const exerciseFilterControl = $("reviewExerciseFilter");
    if (!container || !exerciseFilterControl) return;
    const exerciseFilter = exerciseFilterControl.value;

    let submissions = [...state.submissions];
    if (exerciseFilter && exerciseFilter !== "all") {
      submissions = submissions.filter((submission) => sameId(submission.exerciseId, exerciseFilter));
    }

    submissions.sort((a, b) => b.createdAt - a.createdAt);

    if (!submissions.length) {
      container.innerHTML = '<div class="empty">No submissions match this filter.</div>';
      return;
    }

    container.innerHTML = submissions
      .map((submission) => {
        const exercise = state.exercises.find((item) => sameId(item.id, submission.exerciseId));
        const delta = calcDelta(submission);
        const draft = getReviewDraft(submission);

        return `<article class="card compact submission" id="card-${submission.id}">
          <div class="card-row">
            <div>
              <strong>${escapeHTML(submission.studentName)}</strong>
              <p class="muted">${escapeHTML(exercise ? exercise.title : "Exercise")} • Attempt ${submission.attempt} • ${fmtDate(submission.createdAt)}</p>
            </div>
            <div class="meta-block right">
              <span class="pill ghost">${escapeHTML(exercise?.language || "")}</span>
              ${submission.score != null ? `<span class="pill ghost">Score ${submission.score}</span>` : ""}
              ${delta ? `<span class="pill ${delta > 0 ? "success" : "warn"}">${delta > 0 ? "+" : ""}${delta} vs prev</span>` : ""}
            </div>
          </div>
          <pre class="code-snippet">${escapeHTML(submission.code).slice(0, 1200)}</pre>
          <p class="muted">Student notes: ${escapeHTML(submission.notes || "None")}</p>
          ${renderReviewHistory(submission)}
          <div class="feedback-row">
            <label>
              <span>Score (0-100)</span>
              <input type="number" min="0" max="100" data-action="score" data-id="${submission.id}" value="${draft.score}" placeholder="Enter score">
            </label>
            <label class="grow">
              <span>Instructor comment</span>
              <textarea rows="2" data-action="comment" data-id="${submission.id}" placeholder="Give concrete feedback">${escapeHTML(draft.comment)}</textarea>
            </label>
            <button class="solid" data-action="save" data-id="${submission.id}" type="button">Save</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function handleReviewDraftInput(event) {
    const field = event.target.dataset.action;
    const id = event.target.dataset.id;
    if (!field || !id || !["score", "comment"].includes(field)) return;
    setReviewDraftValue(id, field, event.target.value);
  }

  function renderProgress() {
    const progressStudent = $("progressStudent");
    const progressExercise = $("progressExercise");
    const summary = $("progressSummary");
    const highlights = $("progressHighlights");
    const timeline = $("timeline");
    const commentList = $("progressCommentList");
    const commentForm = $("progressCommentForm");
    if (!progressStudent || !progressExercise || !summary || !timeline || !highlights) return;
    const student = progressStudent.value;
    const exerciseFilter = progressExercise.value;

    if (!student) {
      summary.textContent = "Students will see their improvement trail here after the first submission.";
      highlights.innerHTML = "";
      timeline.innerHTML = "";
      if (commentList) commentList.innerHTML = "";
      if (commentForm) commentForm.classList.add("hidden");
      return;
    }

    let submissions = state.submissions.filter((submission) => submission.studentEmail === student);
    if (exerciseFilter && exerciseFilter !== "all") {
      submissions = submissions.filter((submission) => sameId(submission.exerciseId, exerciseFilter));
    }
    renderProgressComments(student, exerciseFilter);

    submissions.sort((a, b) => a.createdAt - b.createdAt);
    const scoredSubmissions = submissions.filter((submission) => submission.score != null); // Only scored attempts belong in the chart and summary

    if (!scoredSubmissions.length) {
      summary.textContent = "No scored attempts match this selection yet.";
      highlights.innerHTML = "";
      timeline.innerHTML = "";
      return;
    }

    const firstScore = scoredSubmissions[0].score;
    const lastScore = scoredSubmissions[scoredSubmissions.length - 1].score;
    const bestScore = Math.max(...scoredSubmissions.map((submission) => submission.score));
    const avgScore = Math.round(scoredSubmissions.reduce((sum, submission) => sum + submission.score, 0) / scoredSubmissions.length);
    const delta = lastScore - firstScore;
    const reviewedCount = scoredSubmissions.filter((submission) => Array.isArray(submission.reviews) && submission.reviews.length > 0).length;
    const performanceLabel =
      avgScore >= 90 ? "Excellent" :
      avgScore >= 75 ? "Strong" :
      avgScore >= 60 ? "Improving" :
      "Needs support";

    summary.textContent = `${scoredSubmissions.length} attempts • Avg score ${avgScore} • ${delta >= 0 ? "+" : ""}${delta} since first attempt`;
    highlights.innerHTML = `
      <div class="stat">
        <strong>${lastScore}</strong>
        <span>Latest score</span>
      </div>
      <div class="stat">
        <strong>${bestScore}</strong>
        <span>Best score</span>
      </div>
      <div class="stat">
        <strong>${reviewedCount}</strong>
        <span>Reviewed attempts</span>
      </div>
      <div class="stat">
        <strong>${performanceLabel}</strong>
        <span>Performance level</span>
      </div>
    `;

    const sparkline = scoredSubmissions
      .map((submission) => `<div class="spark" style="height:${32 + submission.score / 2}px" title="Attempt ${submission.attempt}: ${submission.score}"></div>`)
      .join("");

    timeline.innerHTML =
      `<div class="sparkline">${sparkline}</div>` +
      scoredSubmissions
        .map((submission) => {
          const exercise = state.exercises.find((item) => sameId(item.id, submission.exerciseId));
          const deltaLabel = calcDelta(submission);
          const latestReview = Array.isArray(submission.reviews) && submission.reviews.length
            ? [...submission.reviews].sort((a, b) => b.createdAt - a.createdAt)[0]
            : null;

          return `<div class="timeline-item">
            <div class="timeline-badge">${submission.attempt}</div>
            <div class="timeline-body">
              <strong>${escapeHTML(exercise ? exercise.title : "Exercise")}</strong>
              <p class="muted">${fmtDate(submission.createdAt)} • Score ${submission.score}${deltaLabel ? ` (${deltaLabel > 0 ? "+" : ""}${deltaLabel} vs prev)` : ""}</p>
              <p>${escapeHTML(latestReview?.comment || submission.notes || "Submission saved.")}</p>
            </div>
          </div>`;
        })
        .join("");

  }

  function renderProgressComments(studentEmail, exerciseFilter) {
    const commentList = $("progressCommentList");
    const commentForm = $("progressCommentForm");
    const commentInput = $("progressCommentInput");
    if (!commentList || !commentForm || !commentInput) return;

    const role = currentRole();
    const loggedIn = Boolean(currentEmail());
    const selectedExerciseId = exerciseFilter && exerciseFilter !== "all" ? Number(exerciseFilter) : null;
    const canManageTeacherComments = role === "pro";
    // A separate read-tracking collection lets the UI show "New" markers
    // per student without duplicating comment content.
    const readIds = new Set(
      (state.progressCommentReads || [])
        .filter((item) => item.studentEmail === studentEmail)
        .map((item) => item.commentId)
    );

    let comments = (state.progressComments || []).filter((comment) => comment.studentEmail === studentEmail);
    comments = selectedExerciseId === null
      ? comments
      : comments.filter((comment) => comment.exerciseId == null || Number(comment.exerciseId) === selectedExerciseId);

    commentList.innerHTML = comments.length
      ? comments
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((comment) => `
            <div class="discussion-item ${comment.authorRole === "pro" ? "teacher" : "student"}">
              <div class="meta-row space">
                <strong>${escapeHTML(comment.authorName || (comment.authorRole === "pro" ? "Teacher" : "Student"))}</strong>
                <span class="pill ${comment.authorRole === "pro" ? "info" : "ghost"}">${comment.authorRole === "pro" ? "Teacher" : "Student"}</span>
              </div>
              <p class="muted">${fmtDate(comment.createdAt)}${comment.editedAt ? ` • Edited ${fmtDate(comment.editedAt)}` : ""}${comment.authorRole === "pro" && !readIds.has(comment.id) && currentRole() === "user" ? " • New" : ""}</p>
              <p>${escapeHTML(comment.comment)}</p>
              ${
                canManageTeacherComments && comment.authorRole === "pro"
                  ? `<div class="discussion-actions">
                      <button class="comment-link" type="button" data-comment-action="edit" data-comment-id="${comment.id}">Edit</button>
                      <button class="comment-link" type="button" data-comment-action="delete" data-comment-id="${comment.id}">Delete</button>
                    </div>`
                  : ""
              }
            </div>
          `)
          .join("")
      : '<div class="empty">No discussion yet for this student and exercise selection.</div>';

    commentForm.classList.toggle("hidden", !loggedIn);
    commentInput.placeholder =
      role === "pro"
        ? "Share teacher feedback on this student’s progress"
        : "Reply to the latest teacher feedback";
    commentForm.dataset.studentEmail = studentEmail;
    commentForm.dataset.exerciseId = selectedExerciseId == null ? "all" : String(selectedExerciseId);
    commentForm.dataset.authorRole = role || "user";

    if (role === "user") {
      const unreadTeacherComments = comments
        .filter((comment) => comment.authorRole === "pro" && !readIds.has(comment.id))
        .map((comment) => comment.id);
      if (unreadTeacherComments.length && !pendingReadMark) {
        pendingReadMark = true;
        markProgressCommentsRead(studentEmail, unreadTeacherComments);
      }
    }
  }

  async function markProgressCommentsRead(studentEmail, commentIds) {
    try {
      await api("/progress-comments/read", {
        method: "POST",
        body: JSON.stringify({ studentEmail, commentIds })
      });
      await fetchState();
      renderProgressBadge();
      renderProgress();
    } catch (_error) {
      // Keep UI usable even if the read marker fails.
    } finally {
      pendingReadMark = false;
    }
  }

  async function handleExerciseForm(event) {
    event.preventDefault();
    if (currentRole() !== "pro") {
      toast("Only teacher accounts can publish exercises.", true);
      return;
    }
    const form = event.target;
    const formData = new FormData(form);

    const payload = {
      title: String(formData.get("title") || "").trim(),
      language: String(formData.get("language") || "").trim(),
      difficulty: String(formData.get("difficulty") || "").trim(),
      prompt: String(formData.get("prompt") || "").trim()
    };

    try {
      await api("/exercises", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await fetchState();
      renderAll();
      form.reset();
      toast("Exercise published");
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function handleSubmissionForm(event) {
    event.preventDefault();
    if (currentRole() !== "user") {
      toast("Only student accounts can submit solutions.", true);
      return;
    }

    if (!state.exercises.length) {
      toast("Publish an exercise before accepting submissions.", true);
      return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const payload = {
      exerciseId: String(formData.get("exercise") || "").trim(),
      studentName: String(formData.get("studentName") || "").trim(),
      studentEmail: currentEmail() || String(formData.get("studentEmail") || "").trim().toLowerCase(),
      code: String(formData.get("code") || "").trim(),
      notes: String(formData.get("notes") || "").trim()
    };

    try {
      const submission = await api("/submissions", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await fetchState();
      renderAll();
      form.reset();
      $("exerciseSelect").value = payload.exerciseId;
      toast(`Attempt ${submission.attempt} saved`);
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function handleReviewActions(event) {
    const action = event.target.dataset.action;
    if (action !== "save") return;
    if (currentRole() !== "pro") {
      toast("Only teacher accounts can review submissions.", true);
      return;
    }

    const id = event.target.dataset.id;
    const card = document.querySelector(`#card-${id}`);
    if (!card) return;

    const comment = card.querySelector("textarea[data-action='comment']")?.value || "";
    const scoreInput = card.querySelector("input[data-action='score']");
    const scoreOverride = scoreInput && scoreInput.value !== "" ? Number(scoreInput.value) : null;

    try {
      await api(`/submissions/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ comment, scoreOverride })
      });
      clearReviewDraft(id);
      await fetchState();
      renderAll();
      const nextCard = document.querySelector(`#card-${id}`);
      nextCard?.scrollIntoView({ behavior: "smooth", block: "start" });
      toast("Feedback saved");
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function handleProgressCommentSubmit(event) {
    event.preventDefault();
    if (!currentRole()) {
      toast("Sign in to post comments.", true);
      return;
    }
    const form = event.target;
    const input = $("progressCommentInput");
    if (!form || !input) return;

    const comment = input.value.trim();
    const studentEmail = form.dataset.studentEmail || "";
    const exerciseId = form.dataset.exerciseId || "all";
    const authorRole = currentRole() || form.dataset.authorRole || "user";
    const authorName =
      currentUserName() ||
      (authorRole === "pro" ? "Teacher" : "Student");

    if (!comment || !studentEmail) {
      toast("Select a student and enter a comment first.", true);
      return;
    }

    try {
      await api("/progress-comments", {
        method: "POST",
        body: JSON.stringify({
          studentEmail,
          exerciseId,
          authorRole,
          authorName,
          comment
        })
      });
      input.value = "";
      await fetchState();
      renderAll();
      toast("Comment saved");
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function handleProgressCommentActions(event) {
    const button = event.target.closest("[data-comment-action]");
    if (!button) return;

    const action = button.dataset.commentAction;
    const commentId = Number(button.dataset.commentId);
    if (!commentId) return;

    if (action === "edit") {
      if (currentRole() !== "pro") return;
      const comment = (state.progressComments || []).find((item) => item.id === commentId);
      if (!comment) return;
      const nextText = window.prompt("Edit teacher comment", comment.comment);
      if (nextText == null) return;
      const trimmed = nextText.trim();
      if (!trimmed) {
        toast("Comment cannot be empty.", true);
        return;
      }
      try {
        await api(`/progress-comments/${commentId}`, {
          method: "PATCH",
          body: JSON.stringify({ comment: trimmed, authorRole: currentRole() })
        });
        await fetchState();
        renderAll();
        toast("Comment updated");
      } catch (error) {
        toast(error.message, true);
      }
    }

    if (action === "delete") {
      if (currentRole() !== "pro") return;
      if (!window.confirm("Delete this teacher comment?")) return;
      try {
        await api(`/progress-comments/${commentId}?authorRole=${encodeURIComponent(currentRole())}`, {
          method: "DELETE",
          headers: {}
        });
        await fetchState();
        renderAll();
        toast("Comment deleted");
      } catch (error) {
        toast(error.message, true);
      }
    }
  }

  function handleSort(mode) {
    sortMode = mode;
    renderExercises();
  }

  function handleQueueJump(event) {
    const id = event.target.closest("[data-jump]")?.dataset.jump;
    if (!id) return;

    const card = document.querySelector(`#card-${id}`);
    if (!card) return;

    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.add("highlight");
    setTimeout(() => card.classList.remove("highlight"), 1400);
  }

  function renderAll() {
    renderStats();
    renderExerciseOptions();
    renderStudentsOptions();
    renderExercises();
    renderQueue();
    renderSubmissions();
    renderProgress();
    renderProgressBadge();
  }

  function startStatePolling() {
    if (!currentRole()) return;
    if (statePollId) return;

    statePollId = window.setInterval(async () => {
      try {
        await fetchState();
        renderAll();
      } catch (_error) {
        // Polling failures should not interrupt the user.
      }
    }, 5000);
  }

  async function init() {
    try {
      await fetchState();
      renderAll();
      startStatePolling();
      window.addEventListener("focus", async () => {
        try {
          await fetchState();
          renderAll();
        } catch (_error) {
          // Ignore focus refresh failures.
        }
      });
    } catch (error) {
      toast(`Could not load platform data: ${error.message}`, true);
    }

    $("newExerciseForm")?.addEventListener("submit", handleExerciseForm);
    $("submissionForm")?.addEventListener("submit", handleSubmissionForm);
    $("submissionList")?.addEventListener("click", handleReviewActions);
    $("submissionList")?.addEventListener("input", handleReviewDraftInput);
    $("submissionList")?.addEventListener("change", handleReviewDraftInput);
    $("queueList")?.addEventListener("click", handleQueueJump);
    $("reviewExerciseFilter")?.addEventListener("change", renderSubmissions);
    $("progressStudent")?.addEventListener("change", renderProgress);
    $("progressExercise")?.addEventListener("change", renderProgress);
    $("progressCommentForm")?.addEventListener("submit", handleProgressCommentSubmit);
    $("progressCommentList")?.addEventListener("click", handleProgressCommentActions);
    $("sortNewest")?.addEventListener("click", () => handleSort("newest"));
    $("sortPopular")?.addEventListener("click", () => handleSort("popular"));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
