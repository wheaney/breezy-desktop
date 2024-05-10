import Gio from 'gi://Gio';

export function getShaderSource(path) {
    const file = Gio.file_new_for_path(path);
    const data = file.load_contents(null);

    // version string helps with linting, but GNOME extension doesn't like it, so remove it if it's there
    //
    // TODO -   Gjs on GNOME 45.5 WARNING: Some code called array.toString() on a Uint8Array instance. Previously this 
    //          would have interpreted the bytes of the array as a string, but that is nonstandard. In the future this 
    //          will return the bytes as comma-separated digits. For the time being, the old behavior has been preserved, 
    //          but please fix your code anyway to use TextDecoder.
    return data[1].toString().replace(/^#version .*$/gm, '') + '\n';
}