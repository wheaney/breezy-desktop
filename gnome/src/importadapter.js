function isGnome45OrLater() {
    return !imports.gi.versions['GLib'];
}

async function importGiModule(module) {
    return isGnome45OrLater() ? import(`gi://${module}`) : Promise.resolve(imports.gi[module]);
}

// Function to dynamically import modules based on GJS version
async function importGiModules(modules) {
    return Promise.all(modules.map(importGiModule));
        
}

async function importNativeModule(path, name) {
    return isGnome45OrLater() ? import(`resource:///org/gnome/shell/${path}/${name}.js`) : Promise.resolve(imports[path][name]);
}

// GNOME 44 and older don't have a base extension class
const ExtensionUtils = imports.misc.extensionUtils;
class BaseExtension {
    getSettings() {
        return ExtensionUtils.getSettings();
    }
}

var ExtensionClassPromise = isGnome45OrLater() ? import(`resource:///org/gnome/shell/extensions/extension.js`) : Promise.resolve(BaseExtension);
