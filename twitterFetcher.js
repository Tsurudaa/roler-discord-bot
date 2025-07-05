import fetch from 'node-fetch';
require('dotenv').config(); // Load .env variables

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const TWITTER_USERNAME = 'BPSP_Official';

let lastTweetId = null;

async function fetchLatestTweet() {
  const url = `https://api.twitter.com/2/tweets/search/recent?query=from:${TWITTER_USERNAME}&tweet.fields=created_at&max_results=5`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`
    }
  });

  const data = await res.json();
  const tweet = data.data?.[0];

  if (!tweet || tweet.id === lastTweetId) return null;

  lastTweetId = tweet.id;
  return tweet;
}

module.exports = { fetchLatestTweet };