document.addEventListener("DOMContentLoaded", async function () {
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  // Mobile navigation
  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
      const isOpen = navLinks.classList.toggle("open");

      menuToggle.textContent = isOpen ? "✕" : "☰";
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("open");
        menuToggle.textContent = "☰";
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Copyright year
  const year = document.getElementById("currentYear");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  if (
    typeof supabaseClient === "undefined"
  ) {
    showLoadError();
    return;
  }

  await loadNews();
  await loadEvents();
  setupContactForm();

  function showLoadError() {
    const newsContainer = document.getElementById("newsContainer");
    const eventsContainer = document.getElementById("eventsContainer");

    if (newsContainer) {
      newsContainer.textContent =
        "News is temporarily unavailable. Please try again later.";
    }

    if (eventsContainer) {
      eventsContainer.textContent =
        "Events are temporarily unavailable. Please try again later.";
    }
  }

  async function loadNews() {
    const container = document.getElementById("newsContainer");

    if (!container) return;

    try {
      const { data, error } = await supabaseClient
        .from("news")
        .select("id, title, content, image_url, created_at")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) throw error;

      container.replaceChildren();

      if (!data || data.length === 0) {
        container.textContent = "There are no published news articles yet.";
        return;
      }

      data.forEach(function (item) {
        const card = document.createElement("article");
        card.className = "content-card";

        if (item.image_url) {
          const img = document.createElement("img");
          img.src = item.image_url;
          img.alt = "";
          img.loading = "lazy";

          img.onerror = function () {
            img.remove();
          };

          card.appendChild(img);
        }

        const body = document.createElement("div");
        body.className = "content-card-body";

        const date = document.createElement("span");
        date.className = "content-meta";
        date.textContent = formatDate(item.created_at);

        const title = document.createElement("h3");
        title.textContent = item.title;

        const content = document.createElement("p");
        content.textContent = excerpt(item.content, 180);

        body.append(date, title, content);
        card.appendChild(body);
        container.appendChild(card);
      });
    } catch (error) {
      console.error("News loading error:", error);
      container.textContent =
        "We could not load the news at this time.";
    }
  }

  async function loadEvents() {
    const container = document.getElementById("eventsContainer");

    if (!container) return;

    try {
      const now = new Date().toISOString();

      const { data, error } = await supabaseClient
        .from("events")
        .select("id, title, description, event_date, location, image_url")
        .eq("published", true)
        .gte("event_date", now)
        .order("event_date", { ascending: true })
        .limit(6);

      if (error) throw error;

      container.replaceChildren();

      if (!data || data.length === 0) {
        container.textContent = "No upcoming events have been published yet.";
        return;
      }

      data.forEach(function (item) {
        const card = document.createElement("article");
        card.className = "content-card";

        if (item.image_url) {
          const img = document.createElement("img");
          img.src = item.image_url;
          img.alt = "";
          img.loading = "lazy";

          img.onerror = function () {
            img.remove();
          };

          card.appendChild(img);
        }

        const body = document.createElement("div");
        body.className = "content-card-body";

        const date = document.createElement("span");
        date.className = "content-meta";
        date.textContent = formatDate(item.event_date);

        const title = document.createElement("h3");
        title.textContent = item.title;

        const description = document.createElement("p");
        description.textContent = excerpt(item.description || "", 150);

        body.append(date, title, description);

        if (item.location) {
          const location = document.createElement("p");
          location.className = "content-meta";
          location.style.marginTop = "12px";
          location.textContent = "Location: " + item.location;
          body.appendChild(location);
        }

        card.appendChild(body);
        container.appendChild(card);
      });
    } catch (error) {
      console.error("Events loading error:", error);
      container.textContent =
        "We could not load events at this time.";
    }
  }

  function setupContactForm() {
    const form = document.getElementById("contactForm");
    const status = document.getElementById("formStatus");

    if (!form || !status) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const submitButton = form.querySelector('button[type="submit"]');

      const name = form.elements.name.value.trim();
      const email = form.elements.email.value.trim();
      const message = form.elements.message.value.trim();

      if (!name || !email || !message) {
        status.textContent = "Please complete all fields.";
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
      status.textContent = "";

      try {
        const { error } = await supabaseClient
          .from("contact_messages")
          .insert([{ name, email, message }]);

        if (error) throw error;

        form.reset();
        status.textContent =
          "Thank you. Your message has been submitted successfully.";
      } catch (error) {
        console.error("Contact form error:", error);

        status.textContent =
          "We could not send your message. Please try again later.";
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Send Message";
      }
    });
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeZone: "Africa/Lagos"
    }).format(date);
  }

  function excerpt(value, maxLength) {
    const text = String(value || "").trim();

    if (text.length <= maxLength) return text;

    return text.slice(0, maxLength).trim() + "...";
  }
});