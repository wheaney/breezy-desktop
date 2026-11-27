const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const qmlDir = path.join(__dirname, '../src/qml');
const helpers = {};
const helperPath = path.join(qmlDir, 'DesktopSources.js');
if (fs.existsSync(helperPath)) {
    vm.runInNewContext(fs.readFileSync(helperPath, 'utf8').replace(/^\.pragma library\s*/, ''), helpers);
}
function functionBody(text, name) {
    const start = text.indexOf(`function ${name}(`);
    assert.notEqual(start, -1);
    const begin = text.indexOf('{', start);
    let depth = 1;
    let end = begin + 1;
    while (depth && end < text.length) {
        if (text[end] === '{') depth++;
        if (text[end] === '}') depth--;
        end++;
    }
    assert.equal(depth, 0);
    return text.slice(start, end);
}
function runFocus(displayScreens, workspaceScreens, selected, state = {}) {
    const effect = state.effect || { poseOrientations: [{}], posePosition: { times: () => ({}) }, zoomOnFocusEnabled: false };
    const desktop = state.desktop || {
        fovDetails: { fullScreenDistancePixels: 1 },
        monitorPlacements: displayScreens.map(() => ({ centerLook: {} })),
        sizeAdjustedScreens: displayScreens,
        focusedMonitorIndex: -1,
        lookingAtMonitorIndex: -1
    };
    state.effect = effect;
    state.desktop = desktop;
    const context = {
        effect, breezyDesktop: desktop, screens: displayScreens,
        smoothFollowEnabled: false, DesktopSources: helpers,
        KWinComponents: { Workspace: { screens: workspaceScreens } },
        displays: { eusToNwuQuat: x => x, eusToNwuVector: x => x, findFocusedMonitor: () => selected }
    };
    vm.runInNewContext(functionBody(fs.readFileSync(path.join(qmlDir, 'BreezyDesktop.qml'), 'utf8'), 'updateFocus') + '\nupdateFocus();', context);
    return effect.lookingAtScreenIndex;
}
const panel = { name: 'panel', model: 'Panel', geometry: { x: 0, y: 0, width: 1280, height: 800 } };
const glasses = { name: 'glasses', model: 'VITURE', geometry: { x: 1920, y: 1080, width: 1920, height: 1080 } };
const virtual = { name: 'Virtual-BreezyDesktop_1', geometry: { x: 3840, y: 1080, width: 1920, height: 1080 } };
const all = [panel, glasses, virtual];
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
test('non-XR output before glasses maps focus to workspace output identity', () => {
    assert.equal(runFocus([glasses, virtual], all, 0), 1);
});
test('virtual focus survives reordered workspace outputs', () => {
    assert.equal(runFocus([glasses, virtual], [virtual, panel, glasses], 1), 0);
});
test('removed output fails closed', () => {
    assert.equal(runFocus([panel], [glasses], 0), -1);
});
test('invalid display indices fail closed', () => {
    assert.equal(runFocus([glasses], all, 99), -1);
    assert.equal(runFocus([glasses], all, -1), -1);
});
test('unchanged gaze re-resolves identity after output reorder', () => {
    const state = {};
    assert.equal(runFocus([glasses], all, 0, state), 1);
    assert.equal(runFocus([glasses], [glasses, panel, virtual], 0, state), 0);
});
test('original physical mirroring includes each output independently', () => {
    const text = fs.readFileSync(path.join(qmlDir, 'main.qml'), 'utf8');
    const start = text.indexOf('property var screens:');
    const begin = text.indexOf('function(screen)', start);
    const brace = text.indexOf('{', begin);
    let depth = 1, end = brace + 1;
    while (depth && end < text.length) {
        if (text[end] === '{') depth++;
        if (text[end] === '}') depth--;
        end++;
    }
    assert.equal(depth, 0);
    const filter = enabled => vm.runInNewContext('(' + text.slice(begin, end) + ')', {
        developerMode: false, mirrorPhysicalDisplays: enabled, supportedModels: ['VITURE']
    });
    assert.deepEqual(all.filter(filter(true)), all);
    assert.deepEqual(all.filter(filter(false)), [glasses, virtual]);
});
test('cursor and desktop capture use the represented output', () => {
    const text = fs.readFileSync(path.join(qmlDir, 'BreezyDesktopDisplay.qml'), 'utf8');
    const display = { screen: panel, cursorPos: { x: 640, y: 400 } };
    const value = name => vm.runInNewContext(text.match(new RegExp('property real ' + name + ': ([^\\n]+)'))[1], { display });
    assert.equal(value('cursorX') / value('screenWidth'), 0.5);
    assert.equal(value('cursorY') / value('screenHeight'), 0.5);
    assert.match(text, /screen: display\.screen/);
});
console.log(`${passed} behavioral tests passed`);
