/* Club Onyx — staff editor. Sessions are issued and verified by /api. */
(function () {
  "use strict";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var login = document.getElementById("login");
  var editor = document.getElementById("editor");
  var loginForm = document.querySelector("[data-login]");
  var loginStatus = document.querySelector("[data-login-status]");
  var saveState = document.querySelector("[data-save-state]");
  var logEl = document.querySelector("[data-admin-log]");

  var eventList = document.querySelector("[data-events-list]");
  var eventEmpty = document.querySelector("[data-events-empty]");
  var eventCount = document.querySelector("[data-count-label]");
  var eventForm = document.querySelector("[data-event-form]");
  var eventFormTitle = document.querySelector("[data-event-form-title]");
  var eventSubmit = document.querySelector("[data-event-submit]");

  var teamList = document.querySelector("[data-team-list]");
  var teamEmpty = document.querySelector("[data-team-empty]");
  var teamCount = document.querySelector("[data-team-count]");
  var memberForm = document.querySelector("[data-member-form]");
  var memberFormTitle = document.querySelector("[data-member-form-title]");
  var memberSubmit = document.querySelector("[data-member-submit]");

  var state = {
    events: [],
    team: [],
    editingEvent: null,
    editingMember: null,
    dirty: false,
    tab: "events"
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function initials(name) {
    var words = String(name || "").replace(/[^\w\s'-]/g, "").split(/\s+/).filter(function (w) {
      return w && ["sir", "dame", "dj", "mc"].indexOf(w.toLowerCase()) === -1;
    });
    if (!words.length) return "ON";
    return words.slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("");
  }

  function log(message) {
    if (logEl) logEl.textContent = message;
  }

  function renderAll() {
    renderEvents();
    renderTeam();
  }

  function setDirty(value) {
    state.dirty = value;
    if (saveState) {
      saveState.textContent = value ? "Unsaved changes" : "Saved";
      saveState.dataset.dirty = value ? "true" : "false";
    }
  }

  /* ---------- API ---------- */
  function api(path, options) {
    var config = Object.assign({ method: "GET", headers: { "Content-Type": "application/json" } }, options || {});
    return fetch(path, config).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (err) { data = {}; }
        if (!res.ok) {
          var error = new Error(data.error || "Request failed (" + res.status + ")");
          error.status = res.status;
          throw error;
        }
        return data;
      });
    });
  }

  /* ---------- Session ---------- */
  function showLogin(message) {
    if (login) login.hidden = false;
    if (editor) editor.hidden = true;
    if (message) {
      loginStatus.textContent = message;
      loginStatus.dataset.state = "error";
    }
    var field = document.getElementById("password");
    if (field) field.focus();
  }

  function showEditor() {
    if (login) login.hidden = true;
    if (editor) editor.hidden = false;
  }

  function checkSession() {
    api("/api/session")
      .then(function (data) {
        if (data.authenticated) { showEditor(); load(); }
        else showLogin("");
      })
      .catch(function (err) {
        showLogin(err.status === 500
          ? "The server is missing its environment variables (see README)."
          : "The editor API is not reachable. Admin editing works on the deployed site or with `npm run dev`.");
      });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var username = loginForm.querySelector("#username").value.trim();
      var password = loginForm.querySelector("#password").value;
      var button = loginForm.querySelector('[type="submit"]');
      button.disabled = true;
      button.textContent = "Signing in…";
      loginStatus.textContent = "";
      api("/api/login", { method: "POST", body: JSON.stringify({ username: username, password: password }) })
        .then(function () {
          loginForm.reset();
          showEditor();
          load();
        })
        .catch(function (err) {
          loginStatus.textContent = err.message || "Sign in failed.";
          loginStatus.dataset.state = "error";
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = "Sign in";
        });
    });
  }

  function logout() {
    api("/api/logout", { method: "POST" })
      .catch(function () {})
      .finally(function () {
        setDirty(false);
        state.events = [];
        state.team = [];
        showLogin("Signed out.");
      });
  }

  /* ---------- Load / save ---------- */
  function load() {
    api("/api/content")
      .then(function (data) {
        state.events = Array.isArray(data.events) ? data.events : [];
        state.team = Array.isArray(data.team) ? data.team : [];
        renderAll();
        setDirty(false);
        log("Loaded " + state.events.length + " events and " + state.team.length + " people.");
      })
      .catch(function (err) {
        log(err.message);
      });
  }

  function save() {
    if (!state.dirty) { log("Nothing to save."); return; }
    api("/api/content", {
      method: "PUT",
      body: JSON.stringify({ events: state.events, team: state.team })
    })
      .then(function (data) {
        setDirty(false);
        log(data.commit
          ? "Published as commit " + String(data.commit).slice(0, 7) + ". The site rebuilds automatically."
          : "Saved to assets/data/content.json.");
        load();
      })
      .catch(function (err) {
        if (err.status === 401) showLogin("Session expired — sign in again.");
        else log(err.message);
      });
  }

  /* ---------- Events ---------- */
  function sortedEvents() {
    return state.events.slice().sort(function (a, b) { return Date.parse(a.date) - Date.parse(b.date); });
  }

  function renderEvents() {
    if (!eventList) return;
    var events = sortedEvents();
    eventList.innerHTML = events.map(function (ev) {
      var d = new Date(ev.date);
      var valid = !isNaN(d.getTime());
      return '' +
        '<div class="admin-row">' +
          '<div><b>' + (valid ? pad(d.getDate()) : "--") + '</b><small>' + (valid ? MONTHS[d.getMonth()] : "—") + '</small></div>' +
          '<div>' +
            '<div class="admin-row-title">' + esc(ev.title || "Untitled") + (ev.featured ? ' · featured' : '') + '</div>' +
            '<div class="admin-row-meta">' + esc(ev.displayDate || ev.date || "") + ' · ' + esc(ev.venue || "—") + '</div>' +
          '</div>' +
          '<div class="admin-row-actions">' +
            '<button class="btn btn--ghost btn--small" type="button" data-edit-event="' + esc(ev.id) + '">Edit</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-delete-event="' + esc(ev.id) + '">Delete</button>' +
          '</div>' +
        '</div>';
    }).join("");
    if (eventEmpty) eventEmpty.hidden = events.length !== 0;
    if (eventCount) eventCount.textContent = events.length + " total";
  }

  function clearEventForm() {
    state.editingEvent = null;
    eventForm.reset();
    if (eventFormTitle) eventFormTitle.textContent = "New event";
    if (eventSubmit) eventSubmit.textContent = "Add event";
  }

  function fillEventForm(ev) {
    state.editingEvent = ev.id;
    eventForm.querySelector('[name="title"]').value = ev.title || "";
    eventForm.querySelector('[name="date"]').value = String(ev.date || "").slice(0, 16);
    eventForm.querySelector('[name="time"]').value = ev.time || "";
    eventForm.querySelector('[name="venue"]').value = ev.venue || "";
    eventForm.querySelector('[name="entry"]').value = ev.entry || "";
    eventForm.querySelector('[name="status"]').value = ev.status || "open";
    eventForm.querySelector('[name="statusLabel"]').value = ev.statusLabel || "";
    eventForm.querySelector('[name="description"]').value = ev.description || "";
    eventForm.querySelector('[name="featured"]').checked = !!ev.featured;
    eventForm.querySelectorAll('[name="tag"]').forEach(function (box) {
      box.checked = (ev.tags || []).indexOf(box.value) !== -1;
    });
    if (eventFormTitle) eventFormTitle.textContent = "Edit event";
    if (eventSubmit) eventSubmit.textContent = "Save event";
    eventForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function displayDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function makeId(text, fallback) {
    var base = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return base || fallback;
  }

  if (eventForm) {
    eventForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var title = eventForm.querySelector('[name="title"]').value.trim();
      var date = eventForm.querySelector('[name="date"]').value;
      if (!title || !date) { log("A title and a date are required."); return; }

      var tags = [];
      eventForm.querySelectorAll('[name="tag"]:checked').forEach(function (box) { tags.push(box.value); });
      if (!tags.length) tags.push("club");

      var normalized = date.length === 16 ? date + ":00" : date;
      var id = state.editingEvent || makeId(title + "-" + normalized.slice(0, 10), "event");
      var existing = state.events.find(function (ev) { return ev.id === id; });

      var event = {
        id: id,
        title: title,
        date: normalized,
        displayDate: displayDate(normalized),
        time: eventForm.querySelector('[name="time"]').value.trim(),
        venue: eventForm.querySelector('[name="venue"]').value.trim(),
        tags: tags,
        status: eventForm.querySelector('[name="status"]').value,
        statusLabel: eventForm.querySelector('[name="statusLabel"]').value.trim() || "Open",
        entry: eventForm.querySelector('[name="entry"]').value.trim(),
        description: eventForm.querySelector('[name="description"]').value.trim(),
        featured: eventForm.querySelector('[name="featured"]').checked
      };

      if (existing) {
        state.events = state.events.map(function (ev) { return ev.id === id ? event : ev; });
        log("Updated “" + title + "”. Press Save changes to publish.");
      } else {
        state.events.push(event);
        log("Added “" + title + "”. Press Save changes to publish.");
      }
      clearEventForm();
      renderEvents();
      setDirty(true);
    });
  }

  if (eventList) {
    eventList.addEventListener("click", function (e) {
      var edit = e.target.closest("[data-edit-event]");
      var del = e.target.closest("[data-delete-event]");
      if (edit) {
        var found = state.events.find(function (ev) { return ev.id === edit.getAttribute("data-edit-event"); });
        if (found) fillEventForm(found);
      }
      if (del) {
        var id = del.getAttribute("data-delete-event");
        var ev = state.events.find(function (x) { return x.id === id; });
        if (!ev || !window.confirm("Delete “" + ev.title + "”?")) return;
        state.events = state.events.filter(function (x) { return x.id !== id; });
        if (state.editingEvent === id) clearEventForm();
        renderEvents();
        setDirty(true);
        log("Deleted “" + ev.title + "”. Press Save changes to publish.");
      }
    });
  }

  /* ---------- Team ---------- */
  function renderTeam() {
    if (!teamList) return;
    teamList.innerHTML = state.team.map(function (member, index) {
      var thumb = member.photo
        ? '<div class="admin-thumb"><img src="' + esc(member.photo) + '" alt=""></div>'
        : '<div class="admin-thumb">' + esc(initials(member.name)) + '</div>';
      return '' +
        '<div class="admin-row admin-row--team">' +
          thumb +
          '<div>' +
            '<div class="admin-row-title">' + esc(member.name) + (member.featured ? ' · home' : '') + '</div>' +
            '<div class="admin-row-meta">' + esc(member.role || "—") + ' · ' + esc(member.dept || "Crew") +
              ((member.tags || []).length ? " · " + esc(member.tags.join(", ")) : "") + '</div>' +
          '</div>' +
          '<div class="admin-row-tools">' +
            '<button class="admin-icon" type="button" data-move="up" data-id="' + esc(member.id) + '" aria-label="Move up"' + (index === 0 ? " disabled" : "") + '>↑</button>' +
            '<button class="admin-icon" type="button" data-move="down" data-id="' + esc(member.id) + '" aria-label="Move down"' + (index === state.team.length - 1 ? " disabled" : "") + '>↓</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-edit-member="' + esc(member.id) + '">Edit</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-delete-member="' + esc(member.id) + '">Delete</button>' +
          '</div>' +
        '</div>';
    }).join("");
    if (teamEmpty) teamEmpty.hidden = state.team.length !== 0;
    if (teamCount) teamCount.textContent = state.team.length + " on the roster";

    var datalist = document.getElementById("dept-options");
    if (datalist) {
      var depts = [];
      state.team.forEach(function (m) { if (m.dept && depts.indexOf(m.dept) === -1) depts.push(m.dept); });
      datalist.innerHTML = depts.map(function (d) { return '<option value="' + esc(d) + '"></option>'; }).join("");
    }
  }

  function clearMemberForm() {
    state.editingMember = null;
    memberForm.reset();
    if (memberFormTitle) memberFormTitle.textContent = "Add someone";
    if (memberSubmit) memberSubmit.textContent = "Add person";
  }

  function fillMemberForm(member) {
    state.editingMember = member.id;
    memberForm.querySelector('[name="name"]').value = member.name || "";
    memberForm.querySelector('[name="role"]').value = member.role || "";
    memberForm.querySelector('[name="dept"]').value = member.dept || "";
    memberForm.querySelector('[name="photo"]').value = member.photo || "";
    memberForm.querySelector('[name="bio"]').value = member.bio || "";
    memberForm.querySelector('[name="tags"]').value = (member.tags || []).join(", ");
    memberForm.querySelector('[name="featured"]').checked = !!member.featured;
    if (memberFormTitle) memberFormTitle.textContent = "Edit person";
    if (memberSubmit) memberSubmit.textContent = "Save person";
    memberForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (memberForm) {
    memberForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = memberForm.querySelector('[name="name"]').value.trim();
      if (!name) { log("A name is required."); return; }

      var photo = memberForm.querySelector('[name="photo"]').value.trim();
      if (photo && !/^https:\/\/[^\s]+$/i.test(photo)) {
        log("Photos need to be a full https:// link (or left empty to use initials).");
        return;
      }

      var tags = memberForm.querySelector('[name="tags"]').value.split(",")
        .map(function (t) { return t.trim(); })
        .filter(Boolean)
        .slice(0, 6);

      var id = state.editingMember || makeId(name, "member");
      var existing = state.team.find(function (m) { return m.id === id; });
      var member = {
        id: id,
        name: name,
        role: memberForm.querySelector('[name="role"]').value.trim(),
        dept: memberForm.querySelector('[name="dept"]').value.trim() || "Crew",
        bio: memberForm.querySelector('[name="bio"]').value.trim(),
        tags: tags,
        photo: photo,
        featured: memberForm.querySelector('[name="featured"]').checked
      };

      if (existing) {
        state.team = state.team.map(function (m) { return m.id === id ? member : m; });
        log("Updated “" + name + "”. Press Save changes to publish.");
      } else {
        state.team.push(member);
        log("Added “" + name + "”. Press Save changes to publish.");
      }
      clearMemberForm();
      renderTeam();
      setDirty(true);
    });
  }

  if (teamList) {
    teamList.addEventListener("click", function (e) {
      var edit = e.target.closest("[data-edit-member]");
      var del = e.target.closest("[data-delete-member]");
      var move = e.target.closest("[data-move]");

      if (edit) {
        var found = state.team.find(function (m) { return m.id === edit.getAttribute("data-edit-member"); });
        if (found) fillMemberForm(found);
      }

      if (del) {
        var id = del.getAttribute("data-delete-member");
        var member = state.team.find(function (x) { return x.id === id; });
        if (!member || !window.confirm("Remove " + member.name + " from the roster?")) return;
        state.team = state.team.filter(function (x) { return x.id !== id; });
        if (state.editingMember === id) clearMemberForm();
        renderTeam();
        setDirty(true);
        log("Removed “" + member.name + "”. Press Save changes to publish.");
      }

      if (move) {
        var moveId = move.getAttribute("data-id");
        var from = state.team.findIndex(function (x) { return x.id === moveId; });
        var to = move.getAttribute("data-move") === "up" ? from - 1 : from + 1;
        if (from < 0 || to < 0 || to >= state.team.length) return;
        var moved = state.team.splice(from, 1)[0];
        state.team.splice(to, 0, moved);
        renderTeam();
        setDirty(true);
      }
    });
  }

  /* ---------- Tabs ---------- */
  document.querySelectorAll("[data-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.tab = button.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach(function (b) {
        b.setAttribute("aria-selected", String(b === button));
      });
      document.querySelectorAll("[data-tab-panel]").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-tab-panel") !== state.tab;
      });
    });
  });

  /* ---------- Toolbar ---------- */
  document.querySelectorAll("[data-action]").forEach(function (button) {
    button.addEventListener("click", function () {
      var action = button.getAttribute("data-action");
      if (action === "save") save();
      if (action === "logout") logout();
      if (action === "clear-event") clearEventForm();
      if (action === "clear-member") clearMemberForm();
      if (action === "reload") {
        if (state.dirty && !window.confirm("Discard unsaved changes?")) return;
        load();
      }
    });
  });

  window.addEventListener("beforeunload", function (e) {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* ---------- Boot ---------- */
  checkSession();
})();
