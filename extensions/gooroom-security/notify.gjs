#!/usr/bin/gjs

const Notify = imports.gi.Notify;

const OS_VULNERABLE = 1 << 0;
const EXE_VULNERABLE = 1 << 1;
const BOOT_VULNERABLE = 1 << 2;
const MEDIA_VULNERABLE = 1 << 3;


let warningSection = [];

if (ARGV[0] & OS_VULNERABLE)
    warningSection.push('Protecting OS');

if (ARGV[0] & EXE_VULNERABLE)
    warningSection.push('Protect executable files');

if (ARGV[0] & BOOT_VULNERABLE)
    warningSection.push('Trusted Booting ');

if (ARGV[0] & MEDIA_VULNERABLE)
    warningSection.push('Resources Control');




Notify.init('Hello world');


var Hello = new Notify.Notification({ summary: 'Security Status Of Gooroom System',
    body: `[${warningSection.join(',')}] A security vulnerability has been detected`,
    'icon_name': 'dialog-information' });
Hello.set_app_name('gooroom-security-status-tool');

Hello.show();
