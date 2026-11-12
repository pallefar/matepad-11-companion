'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePowerShellPorts, extractComPort } = require('../src/main/edl');

test('PowerShell EDL JSON parses single object, array and prefixed output', () => {
  const single = JSON.stringify({
    Name: 'QUSB_BULK_CID:0412 (COM7)',
    DeviceID: 'USB\\VID_05C6&PID_9008\\123456',
  });
  const ports = parsePowerShellPorts(single);
  assert.equal(ports.length, 1);
  assert.equal(ports[0].comPort, 7);

  const array = JSON.stringify([
    { Name: 'QHSUSB_BULK (COM12)', DeviceID: 'USB\\VID_05C6&PID_9008\\AA' },
    { Name: 'Some Other Device', DeviceID: 'USB\\VID_1234&PID_5678\\BB' },
  ]);
  assert.equal(parsePowerShellPorts(array).length, 1);

  const prefixed = 'WARNING: something\n' + single;
  assert.equal(parsePowerShellPorts(prefixed).length, 1);
  assert.deepEqual(parsePowerShellPorts(''), []);
  assert.deepEqual(parsePowerShellPorts('not json'), []);
});

test('COM port extraction handles parentheses and bare names', () => {
  assert.equal(extractComPort('QUSB_BULK_CID:0412 (COM7)'), 7);
  assert.equal(extractComPort('Qualcomm 9008 COM19'), 19);
  assert.equal(extractComPort('no port here'), null);
});
