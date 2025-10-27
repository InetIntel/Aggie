var express = require('express');
var passport = require('passport');
var router = express.Router();
var authController = require('../controllers/authController')
const User = require('../../models/user');
const auth = require('../authentication')();

router.post("/login", passport.authenticate("local"), authController.login);
router.post("/register", authController.register);
router.get('/session', auth.authenticate(), authController.session);
router.post("/logout", auth.authenticate(), authController.logout);
router.post("/pass-reset", auth.authenticate(), User.can('admin users'), authController.passwordReset);

router.post('/webauthn/register/start', auth.authenticate(), authController.webauthnRegisterStart);
router.post('/webauthn/register/finish', auth.authenticate(), authController.webauthnRegisterFinish);

router.post('/webauthn/login/start', authController.webauthnLoginStart);
router.post('/webauthn/login/finish', authController.webauthnLoginFinish);

router.get('/webauthn/credentials', auth.authenticate(), authController.webauthnListCredentials);
router.patch('/webauthn/credentials/:credId', auth.authenticate(), authController.webauthnRenameCredential);
router.delete('/webauthn/credentials/:credId', auth.authenticate(), authController.webauthnDeleteCredential);

module.exports = router;