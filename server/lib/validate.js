'use strict';

const { ApiError } = require('./errors');

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const AAGUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function str(value, { max = 200, required = false, label = 'field' } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new ApiError(400, `Invalid ${label}`);
  value = value.trim();
  if (required && !value) throw new ApiError(400, `${label} is required`);
  if (value.length > max) throw new ApiError(400, `${label} is too long (max ${max})`);
  return value;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function intId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Invalid id');
  return n;
}

function optionalUrl(value, label) {
  const v = str(value, { label, max: 500 });
  if (v && !/^https?:\/\/\S+$/.test(v)) throw new ApiError(400, `${label} must be a full http(s) URL`);
  return v;
}

module.exports = { str, oneOf, intId, optionalUrl, HEX_COLOR_RE, AAGUID_RE, IMAGE_DATA_URL_RE };
