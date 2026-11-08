/**
 * LoliNet admin compatibility entry point.
 *
 * The production admin application is bundled in /admin/index.html so its
 * interface and API client ship together as one verified unit.
 */
(function () {
  'use strict';

  window.LoliNet = window.LoliNet || {};
  window.LoliNet.adminEntry = '/admin/';
})();
