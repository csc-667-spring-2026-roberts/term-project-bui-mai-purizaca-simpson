// src/client/lobby.ts
function clearContainer(container) {
  while (container.firstChild !== null) {
    container.removeChild(container.firstChild);
  }
}
async function loadActivity() {
  const button = document.getElementById("load-activity-btn");
  const container = document.getElementById("activity-list");
  const template = document.getElementById("activity-item-template");
  if (!(button instanceof HTMLButtonElement) || !(container instanceof HTMLDivElement) || !(template instanceof HTMLTemplateElement)) {
    return;
  }
  button.disabled = true;
  button.textContent = "Loading...";
  try {
    const response = await fetch("/test", {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${String(response.status)}`);
    }
    const records = await response.json();
    clearContainer(container);
    for (const record of records) {
      const fragment = template.content.cloneNode(true);
      if (!(fragment instanceof DocumentFragment)) {
        continue;
      }
      const idElement = fragment.querySelector(".activity-id");
      const messageElement = fragment.querySelector(".activity-message");
      const createdAtElement = fragment.querySelector(".activity-created-at");
      if (!(idElement instanceof HTMLElement) || !(messageElement instanceof HTMLElement) || !(createdAtElement instanceof HTMLElement)) {
        continue;
      }
      idElement.textContent = String(record.id);
      messageElement.textContent = record.message;
      createdAtElement.textContent = new Date(record.created_at).toLocaleString();
      container.appendChild(fragment);
    }
  } catch (error) {
    clearContainer(container);
    const errorMessage = document.createElement("p");
    errorMessage.textContent = "Failed to load activity.";
    container.appendChild(errorMessage);
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = "Load Activity";
  }
}
var loadButton = document.getElementById("load-activity-btn");
if (loadButton instanceof HTMLButtonElement) {
  loadButton.addEventListener("click", () => {
    void loadActivity();
  });
}
