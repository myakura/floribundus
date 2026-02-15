/**
 * @typedef {Object} ChromeTab
 * @property {number} id - The ID of the tab. Tab IDs are unique within a browser session
 * @property {number} index - The zero-based index of the tab within its window
 * @property {number} windowId - The ID of the window the tab is contained within
 * @property {string} [url] - The URL the tab is displaying. This property is only present if the extension's manifest includes the "tabs" permission
 * @property {string} [title] - The title of the tab. This property is only present if the extension's manifest includes the "tabs" permission
 * @property {string} status - Either "loading" or "complete"
 * @property {boolean} active - Whether the tab is active in its window (does not necessarily mean the window is focused)
 * @property {boolean} highlighted - Whether the tab is highlighted
 * @property {boolean} pinned - Whether the tab is pinned
 * @property {boolean} discarded - Whether the tab is discarded. A discarded tab is one whose content has been unloaded from memory
 * @property {boolean} incognito - Whether the tab is in an incognito window
 * @property {number} [openerTabId] - The ID of the tab that opened this tab, if any
 * @property {string} [pendingUrl] - The URL the tab is navigating to, before it has committed
 * @property {number} [groupId] - The ID of the group that the tab belongs to
 */

/**
 * @typedef {Object} ParsedDate
 * @property {string|null} year - The year as a string
 * @property {string|null} month - The month as a zero-padded string
 * @property {string|null} day - The day as a zero-padded string
 */

/**
 * @typedef {Object} DateCacheEntry
 * @property {string} url - The URL of the tab
 * @property {string|null} title - The title of the tab
 * @property {string|null} dateString - The raw date string found on the page
 * @property {ParsedDate|null} date - The parsed date object
 */

/**
 * @typedef {DateCacheEntry & {tabId: number, groupId: number|null, groupDate: ParsedDate|null}} TabDateInfo
 * Tab date information, extending DateCacheEntry with Floribundus-specific fields.
 * Uses temporary Map for sorting operations (not persistent cache).
 */
