import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const openAIInstance = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  },
});

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});
