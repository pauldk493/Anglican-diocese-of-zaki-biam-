document.addEventListener("DOMContentLoaded", async function () {
  const loginScreen = document.getElementById("loginScreen");
  const dashboard = document.getElementById("dashboard");
  const loginForm = document.getElementById("loginForm");
  const loginStatus = document.getElementById("loginStatus");
  const dashboardStatus = document.getElementById("dashboardStatus");

  const pageTitle = document.getElementById("pageTitle");

  let currentView = "overview";
  let currentUser = null;

  const views = {
    overview: document.getElementById("overviewView"),
    news: document.getElementById("newsView"),
    events: document.getElementById("eventsView"),
    messages: document.getElementById("messagesView")
  };

  if (typeof supabaseClient === "undefined") {
    loginStatus.textContent =
      "Supabase is not configured. Check supabase-config.js.";
    return;
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    loginStatus.textContent = "";

    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Signing in...";

    try {
      const email = document.getElementById("adminEmail").value.trim();
      const password = document.getElementById("adminPassword").value;

      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await checkSession();
    } catch (error) {
      console.error("Login error:", error);

      loginStatus.textContent =
        "Sign-in failed. Check your credentials and try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Sign In";
    }
  });

  document.getElementById("logoutButton").addEventListener(
    "click",
    async function () {
      await supabaseClient.auth.signOut();

      currentUser = null;
      dashboard.hidden = true;
      loginScreen.hidden = false;

      loginForm.reset();
      loginStatus.textContent = "You have signed out.";
    }
  );

  document.querySelectorAll("[data-view]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!currentUser) return;
      showView(button.dataset.view);
    });
  });

  document.getElementById("newsForm").addEventListener(
    "submit",
    async function (event) {
      event.preventDefault();

      await saveRecord("news", {
        title: document.getElementById("newsTitle").value.trim(),
        content: document.getElementById("newsContent").value.trim(),
        image_url: getOptionalUrl("newsImage"),
        published: document.getElementById("newsPublished").checked
      }, event.currentTarget);
    }
  );

  document.getElementById("eventForm").addEventListener(
    "submit",
    async function (event) {
      event.preventDefault();

      const dateValue = document.getElementById("eventDate").value;

      if (!dateValue) {
        setStatus("Please choose an event date and time.");
        return;
      }

      await saveRecord("events", {
        title: document.getElementById("eventTitle").value.trim(),
        description: document.getElementById("eventDescription").value.trim(),
        event_date: new Date(dateValue).toISOString(),
        location: document.getElementById("eventLocation").value.trim() || null,
        image_url: getOptionalUrl("eventImage"),
        published: document.getElementById("eventPublished").checked
      }, event.currentTarget);
    }
  );

  async function checkSession() {
    try {
      const { data, error } = await supabaseClient.auth.getUser();

      if (error) throw error;

      const user = data.user;

      if (!user) {
        currentUser = null;
        loginScreen.hidden = false;
        dashboard.hidden = true;
        return;
      }

      // Verify administrator access in the database.
      const { data: adminRecord, error: adminError } =
        await supabaseClient
          .from("admin_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

      if (adminError || !adminRecord) {
        await supabaseClient.auth.signOut();

        loginScreen.hidden = false;
        dashboard.hidden = true;

        loginStatus.textContent =
          "This account is not authorized to access the administration dashboard.";

        return;
      }

      currentUser = user;
      loginScreen.hidden = true;
      dashboard.hidden = false;

      await refreshDashboard();
      showView(currentView);
    } catch (error) {
      console.error("Session verification error:", error);

      currentUser = null;
      loginScreen.hidden = false;
      dashboard.hidden = true;

      loginStatus.textContent =
        "We could not verify your administrator access.";
    }
  }

  function showView(viewName) {
    if (!currentUser || !views[viewName]) return;

    currentView = viewName;

    Object.keys(views).forEach(function (key) {
      views[key].hidden = key !== viewName;
    });

    document.querySelectorAll(".nav-item").forEach(function (button) {
      button.classList.toggle(
        "active",
        button.dataset.view === viewName
      );
    });

    const titles = {
      overview: "Dashboard Overview",
      news: "Manage News",
      events: "Manage Events",
      messages: "Contact Messages"
    };

    pageTitle.textContent = titles[viewName];

    if (viewName === "news") loadNewsList();
    if (viewName === "events") loadEventsList();
    if (viewName === "messages") loadMessages();
  }

  async function refreshDashboard() {
    await Promise.all([
      updateNewsCount(),
      updateEventsCount(),
      updateMessagesCount()
    ]);
  }

  async function updateNewsCount() {
    const { count, error } = await supabaseClient
      .from("news")
      .select("id", { count: "exact", head: true })
      .eq("published", true);

    document.getElementById("newsCount").textContent =
      error ? "—" : count;
  }

  async function updateEventsCount() {
    const { count, error } = await supabaseClient
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("published", true)
      .gte("event_date", new Date().toISOString());

    document.getElementById("eventsCount").textContent =
      error ? "—" : count;
  }

  async function updateMessagesCount() {
    const { count, error } = await supabaseClient
      .from("contact_messages")
      .select("id", { count: "exact", head: true });

    document.getElementById("messagesCount").textContent =
      error ? "—" : count;
  }

  async function saveRecord(table, record, form) {
    if (!currentUser) return;

    const button = form.querySelector('button[type="submit"]');

    button.disabled = true;
    setStatus("Saving...");

    try {
      const { error } = await supabaseClient
        .from(table)
        .insert([record]);

      if (error) throw error;

      form.reset();

      setStatus(
        table === "news"
          ? "News article saved successfully."
          : "Event saved successfully."
      );

      await refreshDashboard();

      if (table === "news") await loadNewsList();
      if (table === "events") await loadEventsList();
    } catch (error) {
      console.error("Save error:", error);

      setStatus(
        "Could not save the record. Check the database permissions and required fields."
      );
    } finally {
      button.disabled = false;
    }
  }

  async function loadNewsList() {
    const container = document.getElementById("newsList");
    container.textContent = "Loading news...";

    const { data, error } = await supabaseClient
      .from("news")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      container.textContent = "Could not load news.";
      return;
    }

    container.replaceChildren();

    if (!data.length) {
      container.textContent = "No news articles have been created yet.";
      return;
    }

    data.forEach(function (item) {
      const card = createRecordCard(
        item.title,
        item.content,
        item.published ? "Published" : "Draft",
        item.created_at
      );

      addAction(card, item.published ? "Unpublish" : "Publish", async function () {
        await updateRecord("news", item.id, {
          published: !item.published
        });
      });

      addAction(card, "Delete", async function () {
        if (!confirm("Delete this news article permanently?")) return;
        await deleteRecord("news", item.id);
      }, true);

      container.appendChild(card);
    });
  }

  async function loadEventsList() {
    const container = document.getElementById("eventsList");
    container.textContent = "Loading events...";

    const { data, error } = await supabaseClient
      .from("events")
      .select("*")
      .order("event_date", { ascending: true });

    if (error) {
      container.textContent = "Could not load events.";
      return;
    }

    container.replaceChildren();

    if (!data.length) {
      container.textContent = "No events have been created yet.";
      return;
    }

    data.forEach(function (item) {
      const description = [
        item.description || "",
        "Date: " + formatDate(item.event_date),
        "Location: " + (item.location || "Not specified")
      ].join("\n");

      const card = createRecordCard(
        item.title,
        description,
        item.published ? "Published" : "Draft",
        item.created_at
      );

      addAction(card, item.published ? "Unpublish" : "Publish", async function () {
        await updateRecord("events", item.id, {
          published: !item.published
        });
      });

      addAction(card, "Delete", async function () {
        if (!confirm("Delete this event permanently?")) return;
        await deleteRecord("events", item.id);
      }, true);

      container.appendChild(card);
    });
  }

  async function loadMessages() {
    const container = document.getElementById("messagesList");
    container.textContent = "Loading messages...";

    const { data, error } = await supabaseClient
      .from("contact_messages")
      .select("id, name, email, message, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      container.textContent = "Could not load messages.";
      return;
    }

    container.replaceChildren();

    if (!data.length) {
      container.textContent = "There are no contact messages yet.";
      return;
    }

    data.forEach(function (item) {
      const card = createRecordCard(
        item.name,
        item.message,
        item.email,
        item.created_at
      );

      addAction(card, "Delete", async function () {
        if (!confirm("Delete this message permanently?")) return;
        await deleteRecord("contact_messages", item.id);
      }, true);

      container.appendChild(card);
    });
  }

  async function updateRecord(table, id, updates) {
    if (!currentUser) return;

    const { error } = await supabaseClient
      .from(table)
      .update(updates)
      .eq("id", id);

    if (error) {
      setStatus("Could not update the record.");
      console.error(error);
      return;
    }

    setStatus("Record updated successfully.");

    await refreshDashboard();

    if (table === "news") await loadNewsList();
    if (table === "events") await loadEventsList();
  }

  async function deleteRecord(table, id) {
    if (!currentUser) return;

    const { error } = await supabaseClient
      .from(table)
      .delete()
      .eq("id", id);

    if (error) {
      setStatus("Could not delete the record.");
      console.error(error);
      return;
    }

    setStatus("Record deleted successfully.");

    await refreshDashboard();

    if (table === "news") await loadNewsList();
    if (table === "events") await loadEventsList();
    if (table === "contact_messages") await loadMessages();
  }

  function createRecordCard(title, description, meta, date) {
    const card = document.createElement("article");
    card.className = "record-card";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const metadata = document.createElement("p");
    metadata.className = "record-meta";
    metadata.textContent = meta + " · " + formatDate(date);

    const body = document.createElement("p");
    body.style.whiteSpace = "pre-wrap";
    body.textContent = description || "";

    const actions = document.createElement("div");
    actions.className = "record-actions";

    card.append(heading, metadata, body, actions);

    return card;
  }

  function addAction(card, label, callback, isDelete) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "small-button";

    if (isDelete) {
      button.classList.add("delete-button");
    }

    button.textContent = label;

    button.addEventListener("click", callback);

    card.querySelector(".record-actions").appendChild(button);
  }

  function getOptionalUrl(id) {
    const value = document.getElementById(id).value.trim();

    if (!value) return null;

    try {
      const url = new URL(value);

      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("Invalid URL protocol");
      }

      return url.href;
    } catch {
      throw new Error("Please enter a valid image URL.");
    }
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Lagos"
    }).format(date);
  }

  function setStatus(message) {
    dashboardStatus.textContent = message;
  }

  // Restore an existing session, if one exists.
  await checkSession();

  // Keep the dashboard synchronized with authentication state.
  supabaseClient.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      dashboard.hidden = true;
      loginScreen.hidden = false;
    }
  });
});