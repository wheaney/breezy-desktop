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
  outputs = {
    self,
    nixpkgs,
    flake-utils,
    ...
  }: let
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
      in
        with pkgs; {
          packages = {
            breezy-gnome = callPackage ./nix/packages/breezy-gnome.nix {inherit self;};
            breezy-vulkan = callPackage ./nix/packages/breezy-vulkan.nix {inherit self;};
            breezy-desktop = symlinkJoin {
              name = "breezy-desktop";
              paths = with self.packages.${system}; [
                breezy-gnome
                breezy-vulkan
              ];
            };
            default = self.packages.${system}.breezy-desktop;
          };

          devShells.default = mkShell {inputsFrom = lib.singleton self.packages.${system}.default;};
        }
    )
    // {
      overlays.default = final: prev: {inherit (self.packages.${final.system}) breezy-desktop breezy-vulkan breezy-gnome;};
    };
}
