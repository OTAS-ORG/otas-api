const express = require('express');
const request = require('supertest');
const { AppError } = require('../utils/appError');
const errorHandler = require('../middleware/errorHandler');

const app = express();
app.use(express.json());
app.get('/known', async () => { throw new AppError('MONEY_CLASS_DENIED', 403, { amount: 123456 }); });
app.get('/unexpected', async () => { throw new Error('sensitive 123456'); });
app.post('/json', (req, res) => res.json(req.body));
app.use(errorHandler);

test('returns a named error without internal financial details', async () => {
  const res = await request(app).get('/known');
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ success: false, statusCode: 403, message: 'Access to this information is denied', code: 'MONEY_CLASS_DENIED' });
  expect(JSON.stringify(res.body)).not.toContain('123456');
});

test('hides unexpected error content', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const res = await request(app).get('/unexpected');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/sensitive|123456/);
  } finally { spy.mockRestore(); }
});

test('reports malformed JSON without reflecting its content', async () => {
  const res = await request(app).post('/json').set('Content-Type', 'application/json').send('{"amount": 123456');
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('INVALID_JSON');
  expect(JSON.stringify(res.body)).not.toContain('123456');
});

test('rejects unregistered codes and invalid HTTP statuses', () => {
  expect(() => new AppError('arbitrary secret 123456', 400)).toThrow();
  expect(() => new AppError('ROLE_INVALID', 200)).toThrow();
});

test('delegates when headers are already sent', () => {
  const error = new Error('late failure');
  const next = jest.fn();
  errorHandler(error, {}, { headersSent: true }, next);
  expect(next).toHaveBeenCalledWith(error);
});
