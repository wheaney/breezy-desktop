.pragma library

function workspaceIndex(displayIndex, displayScreens, workspaceScreens) {
    if (displayIndex < 0 || displayIndex >= displayScreens.length) return -1;
    return workspaceScreens.indexOf(displayScreens[displayIndex]);
}
