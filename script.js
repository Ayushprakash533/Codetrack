(function () {
  const API_BASE = "/api";
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

    uniqueEmails.forEach((email) => {
      const option = document.createElement("option");
      option.value = email;
      const name = state.submissions.find((submission) => submission.studentEmail === email)?.studentName || email;
      option.textContent = `${name} (${email})`;
      select.appendChild(option);
    });

    const loggedInEmail = currentEmail();
    if (currentRole() === "user" && loggedInEmail && [...select.options].some((option) => option.value === loggedInEmail)) {
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
      .filter((submission) => submission.status === "submitted")
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
          const pending = submissions.filter((submission) => submission.status === "submitted").length;
          const approved = submissions.filter((submission) => submission.status === "approved").length;
          const tags = (exercise.tags || []).map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("");

          return `<article class="card compact">
            <div class="card-row">
              <div>
                <h3>${escapeHTML(exercise.title)}</h3>
                <p class="muted">${escapeHTML(exercise.prompt)}</p>
                <div class="tags">${tags}</div>
              </div>
              <div class="meta-block">
                <div class="pill ghost">${escapeHTML(exercise.language)}</div>
                <div class="pill ghost">${escapeHTML(exercise.difficulty)}</div>
                ${
                  exercise.link
                    ? `<a class="pill ghost" href="${escapeHTML(exercise.link)}" target="_blank" rel="noopener">Starter link</a>`
                    : ""
                }
              </div>
            </div>
            <div class="meta-row">
              <span>${submissions.length} submissions</span>
              <span>${pending} pending</span>
              <span>${approved} approved</span>
              <span>${fmtDate(exercise.createdAt)}</span>
            </div>
          </article>`;
        })
        .join("") || '<div class="empty">Publish the first exercise to open the workflow.</div>';
  }

  function calcDelta(submission) {
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

  function statusLabel(status) {
    return status === "approved" ? "Approved" : status === "changes" ? "Changes requested" : "Needs review";
  }

  function statusClass(status) {
    return status === "approved" ? "success" : status === "changes" ? "warn" : "info";
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
            <strong>${statusLabel(review.status)}</strong>
            <span class="muted">${fmtDate(review.createdAt)}</span>
          </div>
          <p>${escapeHTML(review.comment || "Status updated without written feedback.")}</p>
        </div>`
      )
      .join("")}</div>`;
  }

  function renderSubmissions() {
    const container = $("submissionList");
    const exerciseFilterControl = $("reviewExerciseFilter");
    const statusFilterControl = $("reviewStatusFilter");
    if (!container || !exerciseFilterControl || !statusFilterControl) return;
    const exerciseFilter = exerciseFilterControl.value;
    const statusFilter = statusFilterControl.value;

    let submissions = [...state.submissions];
    if (exerciseFilter && exerciseFilter !== "all") {
      submissions = submissions.filter((submission) => sameId(submission.exerciseId, exerciseFilter));
    }
    if (statusFilter !== "all") {
      submissions = submissions.filter((submission) => submission.status === statusFilter);
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

        return `<article class="card compact submission" id="card-${submission.id}">
          <div class="card-row">
            <div>
              <div class="meta-row space">
                <strong>${escapeHTML(submission.studentName)}</strong>
                <span class="pill ${statusClass(submission.status)}">${statusLabel(submission.status)}</span>
              </div>
              <p class="muted">${escapeHTML(exercise ? exercise.title : "Exercise")} • Attempt ${submission.attempt} • ${fmtDate(submission.createdAt)}</p>
            </div>
            <div class="meta-block right">
              <span class="pill ghost">${escapeHTML(exercise?.language || "")}</span>
              <span class="pill ghost">Score ${submission.score}</span>
              ${delta ? `<span class="pill ${delta > 0 ? "success" : "warn"}">${delta > 0 ? "+" : ""}${delta} vs prev</span>` : ""}
            </div>
          </div>
          <pre class="code-snippet">${escapeHTML(submission.code).slice(0, 1200)}</pre>
          <p class="muted">Student notes: ${escapeHTML(submission.notes || "None")}</p>
          ${renderReviewHistory(submission)}
          <div class="feedback-row">
            <label>
              <span>Status</span>
              <select data-action="status" data-id="${submission.id}">
                <option value="submitted" ${submission.status === "submitted" ? "selected" : ""}>Needs review</option>
                <option value="approved" ${submission.status === "approved" ? "selected" : ""}>Approved</option>
                <option value="changes" ${submission.status === "changes" ? "selected" : ""}>Changes requested</option>
              </select>
            </label>
            <label class="grow">
              <span>Instructor comment</span>
              <textarea rows="2" data-action="comment" data-id="${submission.id}" placeholder="Give concrete feedback">${escapeHTML(submission.latestComment || "")}</textarea>
            </label>
            <button class="solid" data-action="save" data-id="${submission.id}" type="button">Save</button>
          </div>
        </article>`;
      })
      .join("");
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
    submissions.sort((a, b) => a.createdAt - b.createdAt);

    if (!submissions.length) {
      summary.textContent = "No attempts match this selection yet.";
      highlights.innerHTML = "";
      timeline.innerHTML = "";
      if (commentList) commentList.innerHTML = "";
      if (commentForm) commentForm.classList.add("hidden");
      return;
    }

    const firstScore = submissions[0].score;
    const lastScore = submissions[submissions.length - 1].score;
    const bestScore = Math.max(...submissions.map((submission) => submission.score));
    const avgScore = Math.round(submissions.reduce((sum, submission) => sum + submission.score, 0) / submissions.length);
    const delta = lastScore - firstScore;
    const approvedCount = submissions.filter((submission) => submission.status === "approved").length;
    const performanceLabel =
      avgScore >= 90 ? "Excellent" :
      avgScore >= 75 ? "Strong" :
      avgScore >= 60 ? "Improving" :
      "Needs support";

    summary.textContent = `${submissions.length} attempts • Avg score ${avgScore} • ${delta >= 0 ? "+" : ""}${delta} since first attempt`;
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
        <strong>${approvedCount}</strong>
        <span>Approved attempts</span>
      </div>
      <div class="stat">
        <strong>${performanceLabel}</strong>
        <span>Performance level</span>
      </div>
    `;

    const sparkline = submissions
      .map((submission) => `<div class="spark" style="height:${32 + submission.score / 2}px" title="Attempt ${submission.attempt}: ${submission.score}"></div>`)
      .join("");

    timeline.innerHTML =
      `<div class="sparkline">${sparkline}</div>` +
      submissions
        .map((submission) => {
          const exercise = state.exercises.find((item) => sameId(item.id, submission.exerciseId));
          const deltaLabel = calcDelta(submission);
          const latestReview = Array.isArray(submission.reviews) && submission.reviews.length
            ? [...submission.reviews].sort((a, b) => b.createdAt - a.createdAt)[0]
            : null;

          return `<div class="timeline-item">
            <div class="timeline-badge">${submission.attempt}</div>
            <div class="timeline-body">
              <div class="meta-row space">
                <strong>${escapeHTML(exercise ? exercise.title : "Exercise")}</strong>
                <span class="pill ${statusClass(submission.status)}">${statusLabel(submission.status)}</span>
              </div>
              <p class="muted">${fmtDate(submission.createdAt)} • Score ${submission.score}${deltaLabel ? ` (${deltaLabel > 0 ? "+" : ""}${deltaLabel} vs prev)` : ""}</p>
              <p>${escapeHTML(latestReview?.comment || submission.notes || "Submission saved.")}</p>
            </div>
          </div>`;
        })
        .join("");

    renderProgressComments(student, exerciseFilter);
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
    const readIds = new Set(
      (state.progressCommentReads || [])
        .filter((item) => item.studentEmail === studentEmail)
        .map((item) => item.commentId)
    );

    let comments = (state.progressComments || []).filter((comment) => comment.studentEmail === studentEmail);
    comments = selectedExerciseId === null
      ? comments
      : comments.filter((comment) => Number(comment.exerciseId) === selectedExerciseId);

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
      prompt: String(formData.get("prompt") || "").trim(),
      link: String(formData.get("link") || "").trim(),
      tags: String(formData.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
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
      notes: String(formData.get("notes") || "").trim(),
      outcome: String(formData.get("outcome") || "").trim()
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

    const status = card.querySelector("select[data-action='status']")?.value || "submitted";
    const comment = card.querySelector("textarea[data-action='comment']")?.value || "";

    try {
      await api(`/submissions/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, comment })
      });
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

  async function init() {
    try {
      await fetchState();
      renderAll();
    } catch (error) {
      toast(`Could not load platform data: ${error.message}`, true);
    }

    $("newExerciseForm")?.addEventListener("submit", handleExerciseForm);
    $("submissionForm")?.addEventListener("submit", handleSubmissionForm);
    $("submissionList")?.addEventListener("click", handleReviewActions);
    $("queueList")?.addEventListener("click", handleQueueJump);
    $("reviewExerciseFilter")?.addEventListener("change", renderSubmissions);
    $("reviewStatusFilter")?.addEventListener("change", renderSubmissions);
    $("progressStudent")?.addEventListener("change", renderProgress);
    $("progressExercise")?.addEventListener("change", renderProgress);
    $("progressCommentForm")?.addEventListener("submit", handleProgressCommentSubmit);
    $("progressCommentList")?.addEventListener("click", handleProgressCommentActions);
    $("sortNewest")?.addEventListener("click", () => handleSort("newest"));
    $("sortPopular")?.addEventListener("click", () => handleSort("popular"));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
