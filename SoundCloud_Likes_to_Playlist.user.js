// ==UserScript==
// @name         SoundCloud Public Likes to Playlist
// @namespace    local.soundcloud.likes.to.playlist
// @version      1.9.0
// @description  Add tracks from a public SoundCloud Likes page to your existing playlists using the visible SoundCloud interface.
// @updateURL    https://raw.githubusercontent.com/dukiebrown/Mornye/soundcloud-likes-to-playlist-updates/SoundCloud_Likes_to_Playlist.user.js
// @downloadURL  https://raw.githubusercontent.com/dukiebrown/Mornye/soundcloud-likes-to-playlist-updates/SoundCloud_Likes_to_Playlist.user.js
// @match        https://soundcloud.com/*
// @match        https://www.soundcloud.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const MAX_TRACKS = 10000;
  const MAX_TRACKS_PER_PLAYLIST = 500;
  const MIN_DELAY_MS = 1000;
  const DEFAULT_DELAY_MS = 1000;
  const MAX_DELAY_MS = 10000;
  const RANDOM_DELAY_MS = 300;
  const MAX_SCROLL_STEPS = 1800;
  const SCROLL_STEP_WAIT_MS = 120;
  const LOAD_WAIT_MS = 1200;
  const LOAD_POLL_MS = 100;
  const reservedRouteWords = new Set([
    "albums", "artists", "charts", "comments", "discover", "feed",
    "followers", "following", "groups", "jobs", "likes", "messages",
    "notifications", "pages", "popular-tracks", "reposts", "search",
    "sets", "settings", "stations", "stream", "tracks", "you"
  ]);

  const sleep = function (ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  };

  const normalizeText = function (value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  };

  const isVisible = function (element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  };

  const isLikesPage = function () {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length >= 2 && parts[parts.length - 1].toLowerCase() === "likes";
  };

  const canonicalTrackUrl = function (href) {
    try {
      const url = new URL(href, window.location.href);
      if (url.hostname !== "soundcloud.com" && url.hostname !== "www.soundcloud.com") return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 2) return null;
      if (reservedRouteWords.has(parts[0].toLowerCase()) || reservedRouteWords.has(parts[1].toLowerCase())) return null;
      return "https://soundcloud.com/" + parts[0] + "/" + parts[1];
    } catch (_) {
      return null;
    }
  };

  const getTrackTitle = function (anchor) {
    const title = normalizeText(anchor.getAttribute("title") || anchor.getAttribute("aria-label") || anchor.innerText || anchor.textContent);
    return title || anchor.href;
  };

  const host = document.createElement("div");
  host.id = "sc-public-likes-playlist-helper";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = [
    ":host { all: initial; }",
    ".panel { position: fixed; z-index: 2147483647; right: 18px; bottom: 18px; width: 340px; max-height: 82vh; overflow: auto; box-sizing: border-box; padding: 14px; border: 1px solid #d5d5d5; border-radius: 12px; background: #fff; color: #171717; box-shadow: 0 6px 28px rgba(0,0,0,.24); font: 13px/1.4 Arial, sans-serif; }",
    ".header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }",
    ".header strong { font-size: 14px; }",
    ".version { color: #666; font-size: 10px; font-weight: 400; }",
    "label { display: block; margin: 9px 0 4px; font-weight: 600; }",
    "input { box-sizing: border-box; width: 100%; padding: 8px; border: 1px solid #aaa; border-radius: 6px; font: inherit; }",
    ".playlist-row { margin: 5px 0; }",
    ".delay { display: flex; align-items: center; gap: 7px; margin-top: 8px; }",
    ".delay input { width: 92px; }",
    ".actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 10px; }",
    "button { border: 0; border-radius: 7px; padding: 8px 9px; background: #ff5500; color: #fff; font: 600 12px/1.2 Arial, sans-serif; cursor: pointer; }",
    "button.secondary { background: #333; }",
    "button.subtle { background: #eee; color: #222; }",
    "button:disabled { opacity: .48; cursor: default; }",
    ".stop { width: 100%; margin-top: 7px; }",
    ".status { margin-top: 10px; padding: 8px; border-radius: 6px; background: #f4f4f4; min-height: 34px; }",
    ".note { margin-top: 8px; color: #555; font-size: 11px; }",
    ".log { margin: 8px 0 0; padding-left: 20px; max-height: 150px; overflow: auto; }",
    ".log li { margin: 3px 0; overflow-wrap: anywhere; }",
    ".close { padding: 4px 8px; background: #eee; color: #222; }",
    ".collapsed .body { display: none; }"
  ].join("\n");
  shadow.appendChild(style);

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = [
    '<div class="header"><strong>Public Likes → Playlists <span class="version">v1.9.0</span></strong><button id="collapse" class="close" type="button" aria-label="Collapse panel">−</button></div>',
    '<div class="body">',
    '<label>Existing destination playlists</label>',
    '<div id="playlist-list"></div>',
    '<button id="add-playlist" class="subtle stop" type="button">Add another playlist</button>',
    '<label for="per-playlist">New tracks to add to each playlist (maximum 500)</label>',
    '<input id="per-playlist" type="number" min="1" max="500" step="1" value="500">',
    '<label class="delay" for="delay"><span>Wait between tracks (minimum 1 second)</span><input id="delay" type="number" min="1000" max="10000" step="250" value="1000"></label>',
    '<div class="actions">',
    '<button id="scan" class="secondary" type="button">Scan public likes</button>',
    '<button id="test" type="button">5-track test</button>',
    '<button id="copy" type="button" style="grid-column: 1 / -1">Copy remaining tracks</button>',
    '</div>',
    '<button id="stop" class="subtle stop" type="button" disabled>Stop after current track</button>',
    '<button id="reset" class="subtle stop" type="button">Clear remembered progress</button>',
    '<div id="status" class="status" role="status">Open another user’s public /likes page, then scan it.</div>',
    '<div class="note">Fast adaptive scan; scrolls back to off-screen tracks during copying. Skips items with no Add to playlist control. Adds up to 500 tracks to each playlist in order. Scan limit: 10,000 tracks.</div>',
    '<ol id="log" class="log" aria-live="polite"></ol>',
    '</div>'
  ].join("");
  shadow.appendChild(panel);
  document.body.appendChild(host);

  const playlistList = panel.querySelector("#playlist-list");
  const addPlaylistButton = panel.querySelector("#add-playlist");
  const delayInput = panel.querySelector("#delay");
  const perPlaylistInput = panel.querySelector("#per-playlist");
  const scanButton = panel.querySelector("#scan");
  const testButton = panel.querySelector("#test");
  const copyButton = panel.querySelector("#copy");
  const stopButton = panel.querySelector("#stop");
  const resetButton = panel.querySelector("#reset");
  const statusBox = panel.querySelector("#status");
  const logList = panel.querySelector("#log");
  const collapseButton = panel.querySelector("#collapse");

  let collectedTracks = [];
  let collectedTrackUrls = new Set();
  let completedByKey = new Map();
  let running = false;
  let scanRunning = false;
  let stopRequested = false;
  let uncertainTrack = null;
  let lastPathname = window.location.pathname;

  const makePlaylistField = function (value) {
    const row = document.createElement("div");
    row.className = "playlist-row";
    const input = document.createElement("input");
    input.className = "playlist-name";
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "Exact playlist title";
    input.value = value || "";
    input.setAttribute("aria-label", "Destination playlist " + (playlistList.children.length + 1));
    row.appendChild(input);
    playlistList.appendChild(row);
    return input;
  };

  ["Dema Likes", "Dema Likes 2", "Dema Likes 3"].forEach(makePlaylistField);

  const storageKey = function () {
    return "scPublicLikesTransfer:" + window.location.pathname.toLowerCase();
  };

  const loadCompleted = function () {
    completedByKey = new Map();
    try {
      const value = JSON.parse(window.sessionStorage.getItem(storageKey()) || "[]");
      if (Array.isArray(value)) {
        value.forEach(function (entry) {
          if (entry && typeof entry.url === "string" && typeof entry.destination === "string") {
            completedByKey.set(entry.url, {
              destination: entry.destination,
              alreadyPresent: entry.alreadyPresent === true,
              skippedUnsupported: entry.skippedUnsupported === true
            });
          }
        });
      }
    } catch (_) {
      completedByKey = new Map();
    }
  };

  const saveCompleted = function () {
    try {
      const records = Array.from(completedByKey.entries()).map(function (entry) {
        return {
          url: entry[0],
          destination: entry[1].destination,
          alreadyPresent: entry[1].alreadyPresent === true,
          skippedUnsupported: entry[1].skippedUnsupported === true
        };
      }).slice(0, MAX_TRACKS);
      window.sessionStorage.setItem(storageKey(), JSON.stringify(records));
    } catch (_) {}
  };

  const setStatus = function (message) {
    statusBox.textContent = message;
  };

  const updateControlAvailability = function () {
    const disabled = !isLikesPage() || running || scanRunning;
    scanButton.disabled = disabled;
    testButton.disabled = disabled;
    copyButton.disabled = disabled;
    addPlaylistButton.disabled = running || scanRunning;
    resetButton.disabled = running || scanRunning;
    Array.from(playlistList.querySelectorAll(".playlist-name")).forEach(function (input) {
      input.disabled = running || scanRunning;
    });
  };

  const checkPageRoute = function () {
    if (window.location.pathname === lastPathname) return;
    lastPathname = window.location.pathname;
    collectedTracks = [];
    collectedTrackUrls = new Set();
    updateControlAvailability();
    if (isLikesPage()) setStatus("Likes page detected. Enter your playlist title, then scan.");
    else setStatus("Open another user’s public /likes page to use this panel.");
  };

  const addLog = function (message) {
    const item = document.createElement("li");
    item.textContent = message;
    logList.appendChild(item);
    while (logList.children.length > 30) logList.removeChild(logList.firstChild);
    logList.scrollTop = logList.scrollHeight;
  };

  const collectVisibleTrackLinks = function () {
    const root = document.querySelector("main, [role='main']") || document.body;
    const anchors = root.querySelectorAll("a[href]");
    for (let i = 0; i < anchors.length && collectedTracks.length < MAX_TRACKS; i += 1) {
      const anchor = anchors[i];
      if (!isVisible(anchor)) continue;
      const url = canonicalTrackUrl(anchor.href);
      if (!url || collectedTrackUrls.has(url)) continue;
      if (!findTrackRowForAnchor(anchor, root)) continue;
      collectedTrackUrls.add(url);
      const rect = anchor.getBoundingClientRect();
      collectedTracks.push({
        url: url,
        title: getTrackTitle(anchor),
        scrollY: Math.max(0, rect.top + window.scrollY)
      });
    }
  };

  const documentHeight = function () {
    return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  };

  const waitForTrackGrowth = async function (startCount, startHeight, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      collectVisibleTrackLinks();
      if (collectedTracks.length > startCount || documentHeight() > startHeight) return true;
      await sleep(LOAD_POLL_MS);
    }
    return false;
  };

  const scanLikes = async function () {
    if (!isLikesPage()) {
      setStatus("This is not a public /likes page. Open one and try again.");
      updateControlAvailability();
      return;
    }
    scanRunning = true;
    updateControlAvailability();
    logList.textContent = "";
    collectedTracks = [];
    collectedTrackUrls = new Set();
    const startY = window.scrollY;
    let lastCount = -1;
    let lastHeight = -1;
    let stableAtBottom = 0;
    let reachedLimit = false;
    setStatus("Scanning the Likes page. The page will scroll while more tracks load.");

    for (let step = 0; step < MAX_SCROLL_STEPS; step += 1) {
      collectVisibleTrackLinks();
      if (collectedTracks.length >= MAX_TRACKS) {
        reachedLimit = true;
        break;
      }

      const height = documentHeight();
      const viewport = window.innerHeight || 900;
      const bottom = Math.max(0, height - viewport);
      if (window.scrollY >= bottom - 3) {
        const beforeCount = collectedTracks.length;
        const beforeHeight = height;
        const grew = await waitForTrackGrowth(beforeCount, beforeHeight, LOAD_WAIT_MS);
        const newHeight = documentHeight();
        if (!grew && newHeight === lastHeight && collectedTracks.length === lastCount) stableAtBottom += 1;
        else stableAtBottom = 0;
        lastHeight = newHeight;
        lastCount = collectedTracks.length;
        if (stableAtBottom >= 3) break;
      } else {
        stableAtBottom = 0;
        const beforeCount = collectedTracks.length;
        const beforeHeight = height;
        window.scrollTo(0, Math.min(bottom, window.scrollY + Math.max(500, viewport * 0.8)));
        await sleep(SCROLL_STEP_WAIT_MS);
        collectVisibleTrackLinks();
        const newHeight = documentHeight();
        const newBottom = Math.max(0, newHeight - viewport);
        if (window.scrollY >= newBottom - viewport * 0.2) {
          await waitForTrackGrowth(beforeCount, beforeHeight, LOAD_WAIT_MS);
          collectVisibleTrackLinks();
        }
        lastHeight = documentHeight();
        lastCount = collectedTracks.length;
      }
      setStatus("Scanning… found " + collectedTracks.length + " track(s).");
    }

    collectVisibleTrackLinks();
    window.scrollTo(0, startY);
    await sleep(250);
    scanRunning = false;
    updateControlAvailability();
    if (collectedTracks.length === 0) {
      setStatus("No public track links were found. Confirm this is the user’s /likes page and that tracks loaded.");
    } else if (reachedLimit) {
      setStatus("Found at least 10,000 tracks. The scan is capped at 10,000; older likes may be beyond the limit.");
    } else {
      setStatus("Scan finished: " + collectedTracks.length + " track(s) found.");
    }
  };

  const controlLabels = function (element) {
    const labels = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.innerText,
      element.textContent,
      typeof element.className === "string" ? element.className : ""
    ];
    const descendants = Array.from(element.querySelectorAll("[aria-label], [title]"));
    descendants.forEach(function (child) {
      labels.push(child.getAttribute("aria-label"), child.getAttribute("title"));
    });
    return labels.map(normalizeText).filter(Boolean);
  };

  const controlLabel = function (element) {
    return controlLabels(element)[0] || "";
  };

  const findTrackRowForAnchor = function (anchor, root) {
    let node = anchor;
    for (let level = 0; level < 14 && node && node !== root; level += 1) {
      const links = Array.from(node.querySelectorAll("a[href]"));
      const distinctTracks = new Set(links.map(function (item) { return canonicalTrackUrl(item.href); }).filter(Boolean));
      const controls = Array.from(node.querySelectorAll("button, [role='button'], a[aria-label], a[title], [data-testid]"));
      const rowClass = typeof node.className === "string" ? node.className : "";
      const knownTrackRow = /soundList__item|trackList__item|track__item|sound__body|sound__footer/i.test(rowClass);
      const hasTrackAction = controls.some(function (element) {
        const labels = controlLabels(element).join(" ").toLowerCase();
        return element.getAttribute("aria-haspopup") === "menu" || /like|repost|share|more|option|menu|playlist|add/i.test(labels);
      });
      if (controls.length > 0 && (knownTrackRow || (hasTrackAction && distinctTracks.size === 1))) return node;
      node = node.parentElement;
    }
    return null;
  };

  const trackRow = async function (track) {
    const findRow = function () {
      const root = document.querySelector("main, [role='main']") || document.body;
      const anchors = Array.from(root.querySelectorAll("a[href]"));
      const anchor = anchors.find(function (item) {
        return canonicalTrackUrl(item.href) === track.url && isVisible(item);
      }) || anchors.find(function (item) { return canonicalTrackUrl(item.href) === track.url; });
      if (!anchor) return null;
      return findTrackRowForAnchor(anchor, root);
    };

    let row = findRow();
    if (row || !Number.isFinite(track.scrollY)) return row;
    const viewport = window.innerHeight || 900;
    window.scrollTo(0, Math.max(0, track.scrollY - viewport * 0.3));
    await sleep(SCROLL_STEP_WAIT_MS);
    row = await waitFor(findRow, LOAD_WAIT_MS);
    return row;
  };

  const waitFor = async function (finder, timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const found = finder();
      if (found) return found;
      await sleep(200);
    }
    return null;
  };

  const clickElement = async function (element) {
    if (!element || !isVisible(element) || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
    element.scrollIntoView({ block: "center", behavior: "auto" });
    await sleep(180);
    element.click();
    return true;
  };

  const visibleInteractive = function (root) {
    return Array.from(root.querySelectorAll("button, [role='button'], [role='menuitem'], [role='option'], label"))
      .filter(isVisible);
  };

  const findAddToPlaylistAction = function () {
    const candidates = visibleInteractive(document);
    return candidates.find(function (element) {
      return controlLabels(element).some(function (label) {
        return /^add\s+(?:this\s+)?(?:track\s+)?to\s+(?:your\s+)?playlists?$/i.test(label);
      });
    }) || null;
  };

  const visibleOverlays = function () {
    const selector = "[role='dialog'], [aria-modal='true'], [role='menu'], [role='listbox'], [class*='modal'], [data-testid*='modal'], [data-testid*='popover']";
    return Array.from(document.querySelectorAll(selector)).filter(isVisible);
  };

  const findPlaylistChoice = function (target) {
    const wanted = normalizeText(target).toLowerCase();
    const overlays = visibleOverlays();
    const roots = overlays.length ? Array.from(new Set(overlays)) : [document];
    const candidates = Array.from(new Set(roots.reduce(function (all, root) {
      return all.concat(visibleInteractive(root));
    }, [])));
    const actionKind = function (element) {
      const labels = controlLabels(element);
      if (labels.some(function (label) { return /^add\s+to\s+playlist$/i.test(label); })) return "row-action";
      if (labels.some(function (label) { return /^(?:added|added\s+to\s+playlist|remove\s+from\s+playlist|in\s+playlist)$/i.test(label); })) return "already-added";
      return "";
    };
    const actionButtons = candidates.filter(function (element) {
      return Boolean(actionKind(element));
    });
    const rowMatches = [];
    actionButtons.forEach(function (button) {
      let node = button.parentElement;
      for (let level = 0; level < 9 && node; level += 1) {
        const titleNodes = Array.from(node.querySelectorAll("a, [title], [aria-label], span"))
          .concat([node]);
        const hasExactTitle = titleNodes.some(function (element) {
          if (!isVisible(element)) return false;
          return controlLabels(element).some(function (label) { return label.toLowerCase() === wanted; });
        }) || String(node.innerText || node.textContent).split(/\r?\n/).some(function (line) {
          return normalizeText(line).toLowerCase() === wanted;
        });
        const rowActions = visibleInteractive(node).filter(function (element) {
          return Boolean(actionKind(element));
        });
        if (hasExactTitle && rowActions.length === 1 && rowActions[0] === button) {
          rowMatches.push({ element: button, kind: actionKind(button) });
          break;
        }
        node = node.parentElement;
      }
    });
    if (rowMatches.length === 1) return { element: rowMatches[0].element, ambiguous: false, kind: rowMatches[0].kind };
    if (rowMatches.length > 1) return { element: null, ambiguous: true };

    const directMatches = candidates.filter(function (element) {
      return controlLabels(element).some(function (label) { return label.toLowerCase() === wanted; });
    });
    if (directMatches.length === 1) return { element: directMatches[0], ambiguous: false, kind: "direct" };
    if (directMatches.length > 1) return { element: null, ambiguous: true };
    return { element: null, ambiguous: false };
  };

  const fillPlaylistSearch = async function (target) {
    const inputs = Array.from(document.querySelectorAll("input")).filter(isVisible);
    const search = inputs.find(function (input) {
      const label = normalizeText((input.getAttribute("aria-label") || "") + " " + (input.getAttribute("placeholder") || "")).toLowerCase();
      return input.type === "search" || /search.*playlist|playlist.*search|filter.*playlists?/.test(label);
    });
    if (!search) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(search, target);
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(900);
    return true;
  };

  const findConfirmButton = function () {
    const overlays = visibleOverlays();
    for (let index = overlays.length - 1; index >= 0; index -= 1) {
      const buttons = visibleInteractive(overlays[index]);
      const found = buttons.find(function (element) {
        return /^(add|done|save|confirm)$/i.test(controlLabel(element));
      });
      if (found) return found;
    }
    return null;
  };

  const findPlaylistPickerClose = function () {
    return visibleInteractive(document).find(function (element) {
      return controlLabels(element).some(function (label) {
        return /^(close|close dialog|close modal|dismiss)$/i.test(label);
      });
    }) || null;
  };

  const closePlaylistPicker = async function () {
    if (!visibleOverlays().length) return true;
    const closeButton = findPlaylistPickerClose();
    if (closeButton) {
      await clickElement(closeButton);
      await sleep(350);
    }
    if (visibleOverlays().length) {
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      document.dispatchEvent(escape);
      window.dispatchEvent(escape);
      await sleep(350);
    }
    return visibleOverlays().length === 0;
  };

  const getToastText = function () {
    const nodes = Array.from(document.querySelectorAll("[role='alert'], [role='status'], [data-testid*='toast'], [class*='toast']"));
    return nodes.filter(isVisible).map(function (node) { return normalizeText(node.innerText || node.textContent); }).join(" ");
  };

  const makeUnsupportedTrackError = function (message) {
    const error = new Error(message);
    error.skipTrack = true;
    return error;
  };

  const addOneTrack = async function (track, target) {
    const row = await trackRow(track);
    if (!row) throw makeUnsupportedTrackError("No track controls are available for this item; it may be a playlist rather than an individual track.");
    const controls = Array.from(row.querySelectorAll("button, [role='button'], a[aria-label], a[title], [data-testid]")).filter(isVisible);
    const direct = controls.find(function (element) {
      return controlLabels(element).some(function (label) {
        return /add\s+(?:this\s+)?(?:track\s+)?to\s+(?:your\s+)?playlists?/i.test(label);
      });
    });

    let openedFromDirectButton = false;
    if (direct) {
      if (!(await clickElement(direct))) throw new Error("The Add to playlist control could not be clicked.");
      openedFromDirectButton = true;
    } else {
      const menuButton = controls.find(function (element) {
        const label = controlLabels(element).join(" ").toLowerCase();
        return element.getAttribute("aria-haspopup") === "menu" || /more options|more|track menu|options menu/.test(label);
      });
      if (!menuButton) throw makeUnsupportedTrackError("No Add to playlist or track options button is available; this item cannot be added from SoundCloud’s page.");
      if (!(await clickElement(menuButton))) throw new Error("The track options button could not be clicked.");
      const action = await waitFor(findAddToPlaylistAction, 5000);
      if (!action) {
        const menuClosed = await closePlaylistPicker();
        if (!menuClosed) throw new Error("The item has no Add to playlist option and its menu stayed open. Close it manually before continuing.");
        throw makeUnsupportedTrackError("SoundCloud’s track menu has no Add to playlist option; this item will be skipped.");
      }
      if (!(await clickElement(action))) throw new Error("The Add to playlist menu option could not be clicked.");
    }

    const locateChoice = function () {
      const result = findPlaylistChoice(target);
      return result.element || result.ambiguous ? result : null;
    };
    let choiceResult = await waitFor(locateChoice, 7000);
    if (!choiceResult || choiceResult.ambiguous) {
      const searched = await fillPlaylistSearch(target);
      if (searched) {
        choiceResult = await waitFor(locateChoice, 5000);
      }
    }
    if (!choiceResult) throw new Error("Playlist “" + target + "” was not found. Use its exact, unique title.");
    if (choiceResult.ambiguous) throw new Error("More than one playlist has the exact title “" + target + "”. Rename one so the destination is unambiguous.");

    if (choiceResult.kind === "already-added") {
      const pickerClosed = await closePlaylistPicker();
      if (!pickerClosed) {
        const error = new Error("This track is already in “" + target + "”, but SoundCloud’s playlist picker stayed open. Close it manually before continuing.");
        error.alreadyPresent = true;
        throw error;
      }
      return { alreadyPresent: true, detail: "already in playlist" };
    }

    const beforeToast = getToastText();
    const rowAction = choiceResult.kind === "row-action";
    if (!(await clickElement(choiceResult.element))) throw new Error("The destination playlist could not be selected.");
    await sleep(500);
    const confirm = findConfirmButton();
    if (confirm) {
      if (!(await clickElement(confirm))) throw new Error("The playlist confirmation button could not be clicked.");
      await sleep(900);
    }

    const toast = getToastText();
    if (/could not|failed|error|try again/i.test(toast) && toast !== beforeToast) {
      throw new Error("SoundCloud showed an error after selecting the playlist: " + toast);
    }

    const successToast = /added|saved|updated/i.test(toast) && toast !== beforeToast;
    const buttonShowsAdded = controlLabels(choiceResult.element).some(function (label) {
      return /added|remove from playlist|in playlist/i.test(label);
    });
    const pickerClosed = await closePlaylistPicker();
    if (!pickerClosed) {
      const error = new Error("The track action was sent, but SoundCloud’s playlist picker stayed open. Close it manually before continuing.");
      error.added = rowAction || successToast || buttonShowsAdded;
      throw error;
    }
    if (!rowAction && !successToast && !buttonShowsAdded && confirm) {
      return { alreadyPresent: false, detail: "playlist selected; verify the test in your playlist" };
    }
    if (!rowAction && !successToast && !buttonShowsAdded) {
      throw new Error("SoundCloud closed the playlist chooser without confirming the addition. Check the destination before continuing.");
    }
    return {
      alreadyPresent: false,
      detail: successToast ? "SoundCloud confirmed the addition" : rowAction ? "clicked Add to Playlist on the matching playlist row" : "playlist selected; verify the test in your playlist"
    };
  };

  const setBusy = function (value) {
    running = value;
    updateControlAvailability();
    stopButton.disabled = !value;
  };

  const runCopy = async function (testOnly) {
    if (running) return;
    if (!isLikesPage()) {
      setStatus("Open another user’s public /likes page before copying.");
      return;
    }
    if (!collectedTracks.length) {
      setStatus("Scan the public Likes page first.");
      return;
    }
    const targets = Array.from(playlistList.querySelectorAll(".playlist-name"))
      .map(function (input) { return normalizeText(input.value); })
      .filter(Boolean);
    if (!targets.length) {
      setStatus("Enter at least one existing playlist title.");
      const firstInput = playlistList.querySelector(".playlist-name");
      if (firstInput) firstInput.focus();
      return;
    }
    const targetNames = targets.map(function (target) { return target.toLowerCase(); });
    if (new Set(targetNames).size !== targetNames.length) {
      setStatus("Each destination title must be unique. Remove any duplicate playlist titles.");
      const duplicateInput = Array.from(playlistList.querySelectorAll(".playlist-name")).find(function (input) {
        return targets.filter(function (target) { return target.toLowerCase() === normalizeText(input.value).toLowerCase(); }).length > 1;
      });
      if (duplicateInput) duplicateInput.focus();
      return;
    }

    const requestedPerPlaylist = Number.parseInt(perPlaylistInput.value, 10);
    const perPlaylist = Math.max(1, Math.min(MAX_TRACKS_PER_PLAYLIST, Number.isFinite(requestedPerPlaylist) ? requestedPerPlaylist : MAX_TRACKS_PER_PLAYLIST));
    perPlaylistInput.value = String(perPlaylist);

    loadCompleted();
    const pending = collectedTracks.filter(function (track) { return !completedByKey.has(track.url); });
    if (!pending.length) {
      setStatus("All scanned tracks are already marked complete for this source in this tab.");
      return;
    }

    const destinationCounts = targets.map(function () { return 0; });
    completedByKey.forEach(function (progress) {
      const destinationName = typeof progress === "string" ? progress : progress.destination;
      if (!destinationName || (progress && typeof progress === "object" && (progress.alreadyPresent || progress.skippedUnsupported))) return;
      const destinationIndex = targets.findIndex(function (target) {
        return target.toLowerCase() === destinationName.toLowerCase();
      });
      if (destinationIndex >= 0) destinationCounts[destinationIndex] += 1;
    });
    const availableSlots = destinationCounts.reduce(function (total, count) {
      return total + Math.max(0, perPlaylist - count);
    }, 0);
    if (!availableSlots) {
      setStatus("The configured playlists are full for this transfer. Add another existing playlist title or adjust the per-playlist amount if it has room.");
      return;
    }

    const limit = Math.min(testOnly ? 5 : MAX_TRACKS - completedByKey.size, pending.length);
    if (limit <= 0) {
      setStatus("The 10,000-track transfer safety limit has been reached for this source page.");
      return;
    }

    const enteredDelay = Number.parseInt(delayInput.value, 10);
    const delayMs = Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, Number.isFinite(enteredDelay) ? enteredDelay : DEFAULT_DELAY_MS));
    delayInput.value = String(delayMs);
    stopRequested = false;
    uncertainTrack = null;
    setBusy(true);
    setStatus(testOnly ? "Starting the 5-track test." : "Copying remaining tracks across the configured playlists.");

    let added = 0;
    let capacityReached = false;
    let skippedAlreadyPresent = 0;
    let skippedUnsupported = 0;
    for (let index = 0; index < limit; index += 1) {
      if (stopRequested) break;
      const track = pending[index];
      const destinationIndex = destinationCounts.findIndex(function (count) { return count < perPlaylist; });
      if (destinationIndex < 0) {
        capacityReached = true;
        break;
      }
      const target = targets[destinationIndex];
      setStatus("Track " + (index + 1) + " of " + limit + " → " + target + ": " + track.title);
      try {
        const result = await addOneTrack(track, target);
        completedByKey.set(track.url, { destination: target, alreadyPresent: result.alreadyPresent, skippedUnsupported: false });
        saveCompleted();
        if (result.alreadyPresent) {
          skippedAlreadyPresent += 1;
          addLog("Skipped (already in “" + target + "”): " + track.title + ".");
        } else {
          destinationCounts[destinationIndex] += 1;
          added += 1;
          addLog("Added to “" + target + "”: " + track.title + " — " + result.detail + ".");
        }
      } catch (error) {
        if (error.alreadyPresent) {
          completedByKey.set(track.url, { destination: target, alreadyPresent: true, skippedUnsupported: false });
          saveCompleted();
          skippedAlreadyPresent += 1;
          addLog("Skipped (already in “" + target + "”): " + track.title + ". The picker stayed open; close it to continue.");
          setStatus("Skipped “" + track.title + "” because it is already in “" + target + "”. Close the playlist picker, then click Copy remaining tracks to continue.");
          setBusy(false);
          return;
        }
        if (error.skipTrack) {
          completedByKey.set(track.url, { destination: target, alreadyPresent: false, skippedUnsupported: true });
          saveCompleted();
          skippedUnsupported += 1;
          addLog("Skipped unsupported item: " + track.title + " — " + error.message);
          setStatus("Skipped “" + track.title + "” because SoundCloud has no add-to-playlist control for it. Continuing.");
        } else {
          uncertainTrack = track;
          if (error.added) {
            completedByKey.set(track.url, { destination: target, alreadyPresent: false, skippedUnsupported: false });
            destinationCounts[destinationIndex] += 1;
            saveCompleted();
            added += 1;
            addLog("Added to “" + target + "”: " + track.title + " — close the playlist picker, then verify this track.");
          }
          addLog("Stopped at: " + track.title + " — " + error.message);
          setStatus(error.added
            ? "This track was sent to the playlist, but the picker stayed open. Close it and verify the track; progress is saved."
            : "Stopped at “" + track.title + "”: " + error.message + " Check your playlist before running again.");
          setBusy(false);
          return;
        }
      }

      if (index < limit - 1 && !stopRequested) {
        setStatus("Added " + added + "; skipped " + skippedAlreadyPresent + " already-present and " + skippedUnsupported + " unsupported, of " + limit + ". Waiting " + delayMs + "–" + (delayMs + RANDOM_DELAY_MS) + " ms before the next track.");
        await sleep(delayMs + Math.floor(Math.random() * (RANDOM_DELAY_MS + 1)));
      }
    }

    setBusy(false);
    if (stopRequested) {
      setStatus("Stopped after the current track. " + added + " added; " + skippedAlreadyPresent + " already-present and " + skippedUnsupported + " unsupported item(s) skipped.");
    } else if (testOnly) {
      setStatus("5-track test finished (" + added + " added; " + skippedAlreadyPresent + " already-present and " + skippedUnsupported + " unsupported item(s) skipped). Check the destination playlist before copying the rest.");
    } else if (capacityReached) {
      setStatus("Configured playlist capacity reached (" + added + " added; " + skippedAlreadyPresent + " already-present and " + skippedUnsupported + " unsupported item(s) skipped). Add another existing playlist title, then click Copy remaining tracks.");
    } else {
      setStatus("Run finished (" + added + " added; " + skippedAlreadyPresent + " already-present and " + skippedUnsupported + " unsupported item(s) skipped). Check the destination playlist(s).");
    }
  };

  scanButton.addEventListener("click", scanLikes);
  testButton.addEventListener("click", function () { runCopy(true); });
  copyButton.addEventListener("click", function () { runCopy(false); });
  addPlaylistButton.addEventListener("click", function () {
    const input = makePlaylistField("");
    input.focus();
  });
  stopButton.addEventListener("click", function () {
    stopRequested = true;
    stopButton.disabled = true;
    setStatus("Stop requested. The current track will finish first.");
  });
  resetButton.addEventListener("click", function () {
    if (!window.confirm("Clear remembered progress for this Likes page? Tracks already added may be duplicated if you run it again.")) return;
    completedByKey = new Map();
    try { window.sessionStorage.removeItem(storageKey()); } catch (_) {}
    setStatus("Remembered progress cleared. Tracks already added may be copied again.");
  });
  collapseButton.addEventListener("click", function () {
    panel.classList.toggle("collapsed");
    collapseButton.textContent = panel.classList.contains("collapsed") ? "+" : "−";
    collapseButton.setAttribute("aria-label", panel.classList.contains("collapsed") ? "Expand panel" : "Collapse panel");
  });

  if (!isLikesPage()) {
    updateControlAvailability();
    setStatus("Open another user’s public /likes page to use this panel.");
  }

  window.addEventListener("popstate", checkPageRoute);
  window.addEventListener("hashchange", checkPageRoute);
  window.setInterval(checkPageRoute, 600);
})();
