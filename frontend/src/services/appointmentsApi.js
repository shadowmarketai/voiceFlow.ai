/**
 * appointmentsApi — REST client for the Appointments module.
 * Backed by /api/v1/appointments. Real-time updates come over the
 * existing WebSocket (RealtimeContext) — these methods only mutate.
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const client = axios.create({ baseURL: API_BASE_URL });
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('swetha_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const base = '/api/v1/appointments';

export const appointmentsApi = {
  // KPIs
  getKpis: () => client.get(`${base}/kpis`).then((r) => r.data),

  // Bookings
  listBookings: (params = {}) =>
    client.get(`${base}/bookings`, { params }).then((r) => r.data),
  getBooking: (id) => client.get(`${base}/bookings/${id}`).then((r) => r.data),
  createBooking: (body) => client.post(`${base}/bookings`, body).then((r) => r.data),
  updateBooking: (id, body) =>
    client.patch(`${base}/bookings/${id}`, body).then((r) => r.data),
  cancelBooking: (id, reason) =>
    client
      .delete(`${base}/bookings/${id}`, { params: reason ? { reason } : {} })
      .then((r) => r.data),
  confirmBooking: (id) =>
    client.patch(`${base}/bookings/${id}`, { status: 'confirmed' }).then((r) => r.data),
  markNoShow: (id) =>
    client.patch(`${base}/bookings/${id}`, { status: 'no_show' }).then((r) => r.data),

  // Services
  listServices: () => client.get(`${base}/services`).then((r) => r.data),
  createService: (body) => client.post(`${base}/services`, body).then((r) => r.data),
  updateService: (id, body) =>
    client.patch(`${base}/services/${id}`, body).then((r) => r.data),
  deleteService: (id) => client.delete(`${base}/services/${id}`).then((r) => r.data),

  // Availability
  getAvailability: () => client.get(`${base}/availability`).then((r) => r.data),
  setAvailability: (rules) =>
    client.put(`${base}/availability`, rules).then((r) => r.data),
  listOverrides: () =>
    client.get(`${base}/availability/overrides`).then((r) => r.data),
  createOverride: (body) =>
    client.post(`${base}/availability/overrides`, body).then((r) => r.data),
  deleteOverride: (id) =>
    client.delete(`${base}/availability/overrides/${id}`).then((r) => r.data),

  // Booking pages
  listPages: () => client.get(`${base}/pages`).then((r) => r.data),
  createPage: (body) => client.post(`${base}/pages`, body).then((r) => r.data),
  updatePage: (id, body) => client.patch(`${base}/pages/${id}`, body).then((r) => r.data),
  deletePage: (id) => client.delete(`${base}/pages/${id}`).then((r) => r.data),
};

export default appointmentsApi;
