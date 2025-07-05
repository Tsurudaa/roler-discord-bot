
const fetch = require('node-fetch');

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const TWITTER_USERNAME = 'BPSP_Official'; 

let lastTweetId = null;

async function fetchLatestTweet() {
  const url = `https://api.twitter.com/2/tweets/search/recent?query=from:${BPSP_Official}&tweet.fields=created_at&max_results=5`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AAAAAAAAAAAAAAAAAAAAAIap2wEAAAAAP%2BcunA%2Fk2BKKxiwikOY6sd%2BLBtk%3DZhg1W1jvWVE6VmrUTLXfAjyWyVjDuar9cn8KS4OEH3KE9TbzX7}`
    }
  });

  const data = await res.json();
  const tweet = data.data?.[0];

  if (!tweet || tweet.id === lastTweetId) return null;

  lastTweetId = tweet.id;
  return tweet;
}

module.exports = { fetchLatestTweet };
