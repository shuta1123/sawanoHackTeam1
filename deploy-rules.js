#!/usr/bin/env node
/**
 * Firestore セキュリティルールをデプロイするスクリプト
 * 使い方: node deploy-rules.js
 */

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('./pc-app/node_modules/google-auth-library');

const PROJECT_ID = 'sawano-hack-team1';
const RULES_FILE = path.join(__dirname, 'firestore.rules');
const SA_KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || '/Users/x24099xx/Downloads/sawano-hack-team1-firebase-adminsdk-fbsvc-6230011b2e.json';

async function deployRules() {
  console.log('🔐 Authenticating with service account...');
  const auth = new GoogleAuth({
    keyFile: SA_KEY,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = token.token;

  const rules = fs.readFileSync(RULES_FILE, 'utf8');
  console.log('📋 Rules file loaded');

  // Step 1: Create a new ruleset
  console.log('📤 Creating new ruleset...');
  const createRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: {
          files: [{ name: 'firestore.rules', content: rules }],
        },
      }),
    }
  );
  const ruleset = await createRes.json();
  if (!createRes.ok) {
    console.error('❌ Failed to create ruleset:', JSON.stringify(ruleset, null, 2));
    process.exit(1);
  }
  const rulesetName = ruleset.name;
  console.log('✅ Ruleset created:', rulesetName);

  // Step 2: Update the cloud.firestore release to use the new ruleset
  console.log('🔄 Updating Firestore release...');
  const patchRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        release: { name: `projects/${PROJECT_ID}/releases/cloud.firestore`, rulesetName },
      }),
    }
  );
  const release = await patchRes.json();
  if (!patchRes.ok) {
    console.error('❌ Failed to update release:', JSON.stringify(release, null, 2));
    process.exit(1);
  }
  console.log('✅ Firestore rules deployed successfully!');
  console.log('   Release:', release.name);
}

deployRules().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
