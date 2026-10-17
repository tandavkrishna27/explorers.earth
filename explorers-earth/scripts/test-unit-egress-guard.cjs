'use strict';
const { installGuard } = require('./unit-egress-policy.cjs');
const { channel } = require('node:diagnostics_channel');
const blockedChannel = channel('explorers.contained-unit.blocked');
installGuard({
  net: require('node:net'), tls: require('node:tls'),
  syncBuiltinESMExports: require('node:module').syncBuiltinESMExports,
  publishBlocked: event => blockedChannel.publish(event),
  deferFailure: callback => process.nextTick(callback),
});
