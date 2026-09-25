// Draws every TD Pool icon and logo file from one geometry: the ticket-with-a-check
// mark (native/brand/logo-source.jpg, fitted to vectors on 2026-09-25).
//   swift native/make-artwork.swift        (or: npm run ios:artwork)
// Writes:
//   native/assets/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png  → npm run ios:assets
//   public/icons/{apple-touch-icon,icon-192,icon-512,icon-512-maskable}.png
//   public/icon.svg (the rounded tile, favicon) and public/brand/mark.svg (the mark alone)
// Then refresh the browser-tab .ico from the 512 icon:
//   sips -z 48 48 public/icons/icon-512.png --out /tmp/fav.png && sips -s format ico /tmp/fav.png --out src/app/favicon.ico
import AppKit
import CoreGraphics

// ---------- brand colours ----------
let tileHex = "#fbf8f2"   // the logo's own off-white tile
let inkHex = "#272624"    // the ticket
let fieldHex = "#f2f3ee"  // the app's Daylight page colour (launch screen)
func color(_ hex: String) -> CGColor {
  let v = Int(hex.dropFirst(), radix: 16)!
  return CGColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
}

// ---------- geometry, in the source image's pixels (1254 square, y down) ----------
// Tile centre (626, 626), tile size 1030, tile corner radius 198.
let TILE_C = 626.0, TILE = 1030.0, TILE_R = 198.0
// Ticket: centre, angle (deg), length, height, corner radius, notch radius, notch centre past the end,
// fillet where notch meets edge, notch shift along the end.
let T = (cx: 632.12, cy: 621.09, theta: -18.71, L: 655.03, H: 423.44, rc: 54.91, R: 83.33, off: 0.03, f: 5.62, sh: 10.62)
// Check (upright): vertex, short arm, long arm, stroke width, corner rounding.
let K = (vx: 581.64, vy: 701.75, a: 113.21, b: 248.88, t: 71.06, cr: 7.44)

struct Arc { var c: (Double, Double); var r: Double; var a0: Double; var a1: Double }
enum Seg { case line((Double, Double)), arc(Arc) }

/// Ticket outline in its own frame (origin at centre, x along the length), clockwise on screen.
func ticketLocal() -> [Seg] {
  let X = T.L / 2, Y = T.H / 2, rc = T.rc, R = T.R, f = T.f, sh = T.sh
  let C = (X + T.off, sh)
  let dx = (X - f) - C.0
  let yF = sqrt(max(0, (R + f) * (R + f) - dx * dx))
  let g = atan2(yF, C.0 - (X - f))
  var right: [Seg] = [
    .arc(Arc(c: (X - rc, -Y + rc), r: rc, a0: -.pi / 2, a1: 0)),
    .line((X, sh - yF)),
    .arc(Arc(c: (X - f, sh - yF), r: f, a0: 0, a1: g)),
  ]
  var h1 = atan2(-yF, (X - f) - C.0); if h1 < 0 { h1 += 2 * .pi }
  right += [
    .arc(Arc(c: C, r: R, a0: h1, a1: atan2(yF, (X - f) - C.0))),
    .arc(Arc(c: (X - f, sh + yF), r: f, a0: -g, a1: 0)),
    .line((X, Y - rc)),
    .arc(Arc(c: (X - rc, Y - rc), r: rc, a0: 0, a1: .pi / 2)),
  ]
  // The other end is the same shape turned 180°.
  let left: [Seg] = right.map {
    switch $0 {
    case .line(let q): return .line((-q.0, -q.1))
    case .arc(let a): return .arc(Arc(c: (-a.c.0, -a.c.1), r: a.r, a0: a.a0 + .pi, a1: a.a1 + .pi))
    }
  }
  return right + left
}

/// Ticket outline placed in source-image coordinates.
func ticket() -> [Seg] {
  let th = T.theta * .pi / 180, ct = cos(th), st = sin(th)
  func place(_ q: (Double, Double)) -> (Double, Double) { (T.cx + q.0 * ct - q.1 * st, T.cy + q.0 * st + q.1 * ct) }
  return ticketLocal().map {
    switch $0 {
    case .line(let q): return .line(place(q))
    case .arc(let a): return .arc(Arc(c: place(a.c), r: a.r, a0: a.a0 + th, a1: a.a1 + th))
    }
  }
}

/// The check: a two-arm stroke with square-cut ends and a mitred point.
func checkPolygon() -> [(Double, Double)] {
  let k = 0.70710678, h = K.t / 2
  let A = (K.vx - k * K.a, K.vy - k * K.a), B = (K.vx + k * K.b, K.vy - k * K.b)
  return [
    (A.0 - k * h, A.1 + k * h), (K.vx, K.vy + h / k), (B.0 + k * h, B.1 + k * h),
    (B.0 - k * h, B.1 - k * h), (K.vx, K.vy - h / k), (A.0 + k * h, A.1 - k * h),
  ]
}

/// Rounded polygon as segments (tangent arcs at every corner).
func roundedPolygon(_ pts: [(Double, Double)], r: Double) -> [Seg] {
  var segs: [Seg] = []
  let n = pts.count
  for i in 0..<n {
    let P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n]
    func unit(_ v: (Double, Double)) -> (Double, Double) { let l = hypot(v.0, v.1); return (v.0 / l, v.1 / l) }
    let u = unit((A.0 - P.0, A.1 - P.1)), v = unit((B.0 - P.0, B.1 - P.1))
    let alpha = acos(max(-1, min(1, u.0 * v.0 + u.1 * v.1)))
    let d = r / tan(alpha / 2)
    let T1 = (P.0 + u.0 * d, P.1 + u.1 * d), T2 = (P.0 + v.0 * d, P.1 + v.1 * d)
    let bis = unit((u.0 + v.0, u.1 + v.1))
    let c = (P.0 + bis.0 * r / sin(alpha / 2), P.1 + bis.1 * r / sin(alpha / 2))
    var a0 = atan2(T1.1 - c.1, T1.0 - c.0), a1 = atan2(T2.1 - c.1, T2.0 - c.0)
    // take the short way round
    while a1 - a0 > .pi { a1 -= 2 * .pi }
    while a0 - a1 > .pi { a1 += 2 * .pi }
    segs.append(.line(T1)); segs.append(.arc(Arc(c: c, r: r, a0: a0, a1: a1)))
    _ = T2
  }
  return segs
}
func check() -> [Seg] { roundedPolygon(checkPolygon(), r: K.cr) }

// ---------- output: CoreGraphics ----------
/// Maps source-image coordinates into a target canvas.
struct Frame { var scale: Double; var ox: Double; var oy: Double
  func pt(_ q: (Double, Double)) -> CGPoint { CGPoint(x: q.0 * scale + ox, y: q.1 * scale + oy) } }

func cgPath(_ segs: [Seg], _ fr: Frame) -> CGPath {
  let path = CGMutablePath(); var started = false
  for s in segs {
    switch s {
    case .line(let q):
      if started { path.addLine(to: fr.pt(q)) } else { path.move(to: fr.pt(q)); started = true }
    case .arc(let a):
      let n = max(8, Int(abs(a.a1 - a.a0) * a.r * fr.scale / 1.5))
      for i in 0...n {
        let u = a.a0 + (a.a1 - a.a0) * Double(i) / Double(n)
        let p = fr.pt((a.c.0 + a.r * cos(u), a.c.1 + a.r * sin(u)))
        if started { path.addLine(to: p) } else { path.move(to: p); started = true }
      }
    }
  }
  path.closeSubpath(); return path
}

/// A frame that centres the logo's tile in a canvas, the tile spanning `tilePx`.
func tileFrame(canvas: Double, tilePx: Double) -> Frame {
  let s = tilePx / TILE
  return Frame(scale: s, ox: canvas / 2 - TILE_C * s, oy: canvas / 2 - TILE_C * s)
}

func canvas(_ size: Int, alpha: Bool) -> CGContext {
  let info = alpha ? CGImageAlphaInfo.premultipliedLast : CGImageAlphaInfo.noneSkipLast
  let c = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info.rawValue)!
  c.translateBy(x: 0, y: CGFloat(size)); c.scaleBy(x: 1, y: -1)   // draw y-down
  return c
}

func drawMark(_ c: CGContext, _ fr: Frame, knockout: String?) {
  c.setFillColor(color(inkHex)); c.addPath(cgPath(ticket(), fr)); c.fillPath()
  if let knockout { c.setFillColor(color(knockout)); c.addPath(cgPath(check(), fr)); c.fillPath() }
  else { c.setBlendMode(.clear); c.addPath(cgPath(check(), fr)); c.fillPath(); c.setBlendMode(.normal) }
}

func write(_ c: CGContext, _ path: String) {
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, "public.png" as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, c.makeImage()!, nil)
  guard CGImageDestinationFinalize(dest) else { fatalError("could not write \(path)") }
  print("wrote \(path)")
}

/// Full-bleed square icon: iOS and Android round the corners themselves, and the App Store rejects alpha.
func fullBleedIcon(_ size: Int) -> CGContext {
  let c = canvas(size, alpha: false), n = Double(size)
  c.setFillColor(color(tileHex)); c.fill(CGRect(x: 0, y: 0, width: n, height: n))
  drawMark(c, tileFrame(canvas: n, tilePx: n), knockout: tileHex)
  return c
}
/// The logo exactly as supplied: a rounded tile on transparency (browser tabs, PWA "any" icons).
func roundedTileIcon(_ size: Int) -> CGContext {
  let c = canvas(size, alpha: true), n = Double(size)
  let fr = tileFrame(canvas: n, tilePx: n)
  c.setFillColor(color(tileHex))
  c.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: n, height: n), cornerWidth: TILE_R * fr.scale, cornerHeight: TILE_R * fr.scale, transform: nil))
  c.fillPath()
  drawMark(c, fr, knockout: tileHex)
  return c
}

let a = "native/assets", icons = "public/icons"
write(fullBleedIcon(1024), "\(a)/icon-only.png")
do { let c = canvas(1024, alpha: false); c.setFillColor(color(tileHex)); c.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024)); write(c, "\(a)/icon-background.png") }
do { let c = canvas(1024, alpha: true); drawMark(c, tileFrame(canvas: 1024, tilePx: 1024 * 0.8), knockout: nil); write(c, "\(a)/icon-foreground.png") }
// Launch screen: the mark alone on the app's field. The ticket is about 480 px across on the 2732 canvas.
for name in ["splash", "splash-dark"] {
  let c = canvas(2732, alpha: false)
  c.setFillColor(color(fieldHex)); c.fill(CGRect(x: 0, y: 0, width: 2732, height: 2732))
  drawMark(c, tileFrame(canvas: 2732, tilePx: 700), knockout: fieldHex)
  write(c, "\(a)/\(name).png")
}
write(fullBleedIcon(180), "\(icons)/apple-touch-icon.png")
write(roundedTileIcon(192), "\(icons)/icon-192.png")
write(roundedTileIcon(512), "\(icons)/icon-512.png")
write(fullBleedIcon(512), "\(icons)/icon-512-maskable.png")

// ---------- output: SVG ----------
func fmt(_ v: Double) -> String { String(format: "%.2f", v).replacingOccurrences(of: ".00", with: "") }
func svgPath(_ segs: [Seg], _ fr: Frame) -> String {
  var d = "", cur: (Double, Double)? = nil
  func move(_ q: (Double, Double)) { let p = fr.pt(q); d += (cur == nil ? "M" : "L") + "\(fmt(Double(p.x))) \(fmt(Double(p.y))) "; cur = q }
  for s in segs {
    switch s {
    case .line(let q): move(q)
    case .arc(let a):
      let start = (a.c.0 + a.r * cos(a.a0), a.c.1 + a.r * sin(a.a0)), end = (a.c.0 + a.r * cos(a.a1), a.c.1 + a.r * sin(a.a1))
      if let c = cur, hypot(c.0 - start.0, c.1 - start.1) < 0.01 {} else { move(start) }
      let p = fr.pt(end), r = a.r * fr.scale
      let large = abs(a.a1 - a.a0) > .pi ? 1 : 0, sweep = a.a1 > a.a0 ? 1 : 0
      d += "A\(fmt(r)) \(fmt(r)) 0 \(large) \(sweep) \(fmt(Double(p.x))) \(fmt(Double(p.y))) "
      cur = end
    }
  }
  return d + "Z"
}
let markD = { (fr: Frame) in svgPath(ticket(), fr) + " " + svgPath(check(), fr) }
do {
  let fr = tileFrame(canvas: 1024, tilePx: 1024)
  let svg = """
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="TD Pool">
    <rect width="1024" height="1024" rx="\(fmt(TILE_R * fr.scale))" fill="\(tileHex)"/>
    <path fill="\(inkHex)" fill-rule="evenodd" d="\(markD(fr))"/>
  </svg>

  """
  try! svg.write(toFile: "public/icon.svg", atomically: true, encoding: .utf8); print("wrote public/icon.svg")
}
do {
  // The mark alone, trimmed to the ticket with a little room around it.
  let fr = Frame(scale: 1, ox: -250, oy: -290)
  let svg = """
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 660" role="img" aria-label="TD Pool">
    <path fill="\(inkHex)" fill-rule="evenodd" d="\(markD(fr))"/>
  </svg>

  """
  try! svg.write(toFile: "public/brand/mark.svg", atomically: true, encoding: .utf8); print("wrote public/brand/mark.svg")
}
