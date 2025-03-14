{
  description = "Nix Flake for breezy-desktop";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs?ref=nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    flake-compat = {
      url = "github:edolstra/flake-compat";
      flake = false;
    };
    self.submodules = true;
  };
  outputs = inputs: let
    inherit (inputs) self nixpkgs flake-utils;
    systems = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  in
    flake-utils.lib.eachSystem systems
    (
      system: let
        pkgs = import nixpkgs {
          inherit system;
        };
      in {
        packages = {
          breezy-gnome = pkgs.callPackage ./nix/packages/breezy-gnome.nix {inherit self;};
          #breezy-vulkan = pkgs.callPackage ./nix/packages/breezy-vulkan.nix {inherit self;};
          #breezy-kwin = pkgs.callPackage ./nix/packages/breezy-kwin.nix {inherit self;};
          breezy-desktop = pkgs.symlinkJoin {
            name = "breezy-desktop";
            paths = with self.packages.${system}; [
              breezy-gnome
              #breezy-vulkan
              #breezy-kwin
            ];
          };
          default = self.packages.${system}.breezy-desktop;
        };

        devShells.default = pkgs.mkShell {inputsFrom = with self.packages.${system}; [default];};
      }
    )
    // {
      overlays.default = final: _prev: {inherit (self.packages.${final.system}) breezy-desktop breezy-vulkan breezy-gnome breezy-kwin;};
    };
}
