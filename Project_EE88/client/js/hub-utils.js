/**
 * Hub Utils — shared utility functions
 */

 
var HubUtils = (function () {
  'use strict';

  /**
   * Escape HTML entities to prevent XSS in string concatenation.
   * Use this whenever inserting user/DB data into HTML strings.
   *
   * @param {*} str — value to escape (auto-converts to string)
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return { escapeHtml: escapeHtml };
})();
