import handler from '../../server/handler.mjs';

export default (req) => handler(req);

export const config = { path: '/api/*' };
