/**
 * @spfn/auth Routes
 *
 * Combines all authentication routes
 */

import { Hono } from 'hono';
import authRoutes from './auth/index.js';
import invitationRoutes from './invitations/index.js';

const app = new Hono();

// Mount sub-routes
app.route('/auth', authRoutes);
app.route('/invitations', invitationRoutes);

export default app;