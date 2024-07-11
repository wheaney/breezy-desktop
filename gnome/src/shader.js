const Gio = imports.gi.Gio;

function getShaderSource(path) {
    const file = Gio.file_new_for_path(path);
    const data = file.load_contents(null);

    const bytes = new Uint8Array(data[1]);
    const decoder = new TextDecoder();
    const shaderSource = decoder.decode(bytes);

    // version string helps with linting, but GNOME extension doesn't like it, so remove it if it's there
    return shaderSource.replace(/^#version .*$/gm, '') + '\n';
}