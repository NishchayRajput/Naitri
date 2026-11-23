import type { MetadataRoute } from "next"

// Lets "Add to Home Screen" / "Install app" use the Naitri icon and colours.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Naitri",
    short_name: "Naitri",
    description: "Fast, open video meetings.",
    start_url: "/",
    display: "standalone",
    background_color: "#07080a",
    theme_color: "#07080a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }
}
