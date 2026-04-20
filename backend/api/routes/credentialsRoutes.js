'use strict';
const express = require('express');
const router = express.Router();
const User = require('../../models/user');
const credentialsController = require('../controllers/credentialsController');

// Get all credentials
router.get('', User.can('change settings'), credentialsController.credential_credentials);

// Create credentials
router.post('', User.can('change settings'), credentialsController.credential_create);

// Delete credentials
router.delete('/:_id', User.can('change settings'), credentialsController.credential_delete);

// Get a set of (stripped) credentials by its ID
router.get('/:_id', User.can('change settings'), credentialsController.credential_details);

// Create a telegram user signin verification workflow
router.post(
  '/telegram-user/auth/start',
  User.can('change settings'),
  credentialsController.telegramUserAuthStart
);

// Verify a telegram user signin with verification code
router.post(
  '/telegram-user/auth/verify-code',
  User.can('change settings'),
  credentialsController.telegramUserAuthVerifyCode
);

// Verify a telegram user signin with 2fa password
router.post(
  '/telegram-user/auth/verify-password',
  User.can('change settings'),
  credentialsController.telegramUserAuthVerifyPassword
);

router.post(
  '/mastodon/auth/start',
  User.can('change settings'),
  credentialsController.mastodonAuthStart
);

router.get(
  '/mastodon/auth/callback',
  User.can('change settings'),
  credentialsController.mastodonAuthCallback
);

router.get(
  '/mastodon/auth/status/:authRequestId',
  User.can('change settings'),
  credentialsController.mastodonAuthStatus
);

module.exports = router;
