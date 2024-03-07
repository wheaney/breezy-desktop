const Lang = imports.lang;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Cogl = imports.gi.Cogl;
const Shell = imports.gi.Shell;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;


class Extension {
    enable() {
        var XREffect = GObject.registerClass({}, class XREffect extends Shell.GLSLEffect {
            vfunc_build_pipeline() {
                // TODO - replace this with the sombrero shader
                const declares = `
                    uniform sampler2D uDesktopTexture;
                `;
                const code = `
                    cogl_color_out = texture2D(uDesktopTexture, cogl_tex_coord_in[0].xy);
                `;
                this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, declares, code, false);
            }

            // TODO - read IMU data and update uniform variables
            vfunc_paint_target(node, paintContext) {
              if (!this._initialized) { 
                this.set_uniform_float(this.get_uniform_location('uDesktopTexture'), 1, [0]);
                this._initialized = true;
              }

              super.vfunc_paint_target(node, paintContext);
            }
        });

        Main.uiGroup.add_effect(new XREffect());
    }

    disable() {
    }
}

function init() {
    return new Extension();
}