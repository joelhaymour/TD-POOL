// Draws TD Pool's app artwork from the same shapes as public/icon.svg.
//   swift native/make-artwork.swift
// Writes native/assets/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png
// (what @capacitor/assets expects) plus public/icons/{apple-touch-icon,icon-192,icon-512,icon-512-maskable}.png.
import AppKit
import CoreText

let green = CGColor(red: 0x1f/255, green: 0x8a/255, blue: 0x4c/255, alpha: 1)
let lime = CGColor(red: 0xb8/255, green: 0xf2/255, blue: 0x4a/255, alpha: 1)
let ink = CGColor(red: 0x0d/255, green: 0x1f/255, blue: 0x14/255, alpha: 1)
let field = CGColor(red: 0x0a/255, green: 0x0e/255, blue: 0x0b/255, alpha: 1)

/// Opaque by default: App Store and home-screen icons must not carry an alpha
/// channel. Only the rounded web icons ask for one.
func context(_ size: Int, alpha: Bool = false) -> CGContext {
  let info = alpha ? CGImageAlphaInfo.premultipliedLast : CGImageAlphaInfo.noneSkipLast
  let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: info.rawValue)!
  ctx.setAllowsAntialiasing(true)
  ctx.setShouldAntialias(true)
  return ctx
}

/// The mark from icon.svg scaled so the 512-unit drawing fills `unit` px, centered in the canvas.
func drawMark(_ ctx: CGContext, canvas: Int, unit: CGFloat, withText: Bool = true) {
  let s = unit / 512
  let c = CGFloat(canvas) / 2
  ctx.setFillColor(lime)
  ctx.fillEllipse(in: CGRect(x: c - 148 * s, y: c - 148 * s, width: 296 * s, height: 296 * s))
  ctx.setStrokeColor(ink)
  ctx.setLineWidth(28 * s)
  ctx.strokeEllipse(in: CGRect(x: c - 118 * s, y: c - 118 * s, width: 236 * s, height: 236 * s))
  guard withText else { return }
  let font = NSFont.systemFont(ofSize: 140 * s, weight: .heavy)
  let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(cgColor: ink)!]
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: "TD", attributes: attrs))
  let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
  // Center the glyph box (not the typographic box) on the circle.
  ctx.textPosition = CGPoint(x: c - bounds.midX, y: c - bounds.midY)
  CTLineDraw(line, ctx)
}

func write(_ ctx: CGContext, _ path: String) {
  let image = ctx.makeImage()!
  let url = URL(fileURLWithPath: path)
  let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { fatalError("could not write \(path)") }
  print("wrote \(path)")
}

/// Full-bleed square icon (iOS rounds the corners itself; App Store rejects alpha).
func icon(_ size: Int, rounded: Bool = false) -> CGContext {
  let ctx = context(size, alpha: rounded)
  if rounded {
    let r = CGFloat(size) * 96 / 512
    ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: size, height: size), cornerWidth: r, cornerHeight: r, transform: nil))
    ctx.clip()
  }
  ctx.setFillColor(green)
  ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
  drawMark(ctx, canvas: size, unit: CGFloat(size))
  return ctx
}

let a = "native/assets"
write(icon(1024), "\(a)/icon-only.png")
// Adaptive pieces (Android-style); harmless extras that keep the generator happy.
let bg = context(1024); bg.setFillColor(green); bg.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024)); write(bg, "\(a)/icon-background.png")
let fg = context(1024, alpha: true); drawMark(fg, canvas: 1024, unit: 1024 * 0.8); write(fg, "\(a)/icon-foreground.png")

// Launch screen: the mark alone on the app's dark field, both light and dark variants identical.
for name in ["splash", "splash-dark"] {
  let ctx = context(2732)
  ctx.setFillColor(field)
  ctx.fill(CGRect(x: 0, y: 0, width: 2732, height: 2732))
  drawMark(ctx, canvas: 2732, unit: 720)
  write(ctx, "\(a)/\(name).png")
}

// Web / PWA icons.
let p = "public/icons"
write(icon(180), "\(p)/apple-touch-icon.png")
write(icon(192, rounded: true), "\(p)/icon-192.png")
write(icon(512, rounded: true), "\(p)/icon-512.png")
write(icon(512), "\(p)/icon-512-maskable.png")
