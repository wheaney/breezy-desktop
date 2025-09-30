{
  description = "Nix Flake for breezy-desktop";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs?ref=nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    flake-compat = {
      url = "github:edolstra/flake-compat";
      flake = false;
    };
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
          breezy-gnome = pkgs.callPackage ./.nix/packages/breezy-gnome {inherit self;};
          breezy-kde = pkgs.callPackage ./.nix/packages/breezy-kde {inherit self;};
          breezy-ui = pkgs.callPackage ./.nix/packages/breezy-ui {inherit self;};
          breezy-vulkan = pkgs.callPackage ./.nix/packages/breezy-vulkan {inherit self;};
          breezy-desktop = pkgs.symlinkJoin {
            name = "breezy-desktop";
            paths = with self.packages.${pkgs.system}; [
              breezy-gnome
              breezy-kde
              breezy-ui
              breezy-vulkan
            ];
          };
          default = self.packages.${pkgs.system}.breezy-desktop;
        };

        devShells.default = pkgs.mkShell {inputsFrom = with self.packages.${pkgs.system}; [default];};
      }
    )
    // {
      overlays.default = final: _prev: {
        inherit
          (self.packages.${final.system})
          breezy-desktop
          breezy-gnome
          breezy-kde
          breezy-ui
          breezy-vulkan
          ;
      };
    };
}
