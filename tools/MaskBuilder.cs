// Builds a 1-bit land/sea raster from OpenStreetMap coastline ways (Overpass JSON, "out geom").
// Coastlines are drawn as 1-px lines, then the sea is flood-filled (4-connected) from known
// open-water seed points. Everything the flood does not reach is land.
// Output PNG: white = sea, black = land. Metadata (bbox, size) goes to a JSON next to it.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

public static class MaskBuilder
{
    static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    // seeds: "lat,lon;lat,lon"  carve: "lat,lon,lat,lon,...|..." polylines forced to sea (2 px wide)
    public static string Build(string jsonPath, string outPng, double south, double west, double north, double east,
                               double cellMeters, string seeds, string carve)
    {
        double latMid = (south + north) / 2;
        double dLat = cellMeters / 111320.0;
        double dLon = cellMeters / (111320.0 * Math.Cos(latMid * Math.PI / 180));
        int rows = (int)Math.Ceiling((north - south) / dLat);
        int cols = (int)Math.Ceiling((east - west) / dLon);
        // 0 = unknown, 1 = coastline, 2 = sea
        byte[] g = new byte[rows * cols];

        string text = File.ReadAllText(jsonPath);
        var geomRe = new Regex("\"geometry\"\\s*:\\s*\\[(.*?)\\]", RegexOptions.Singleline);
        var ptRe = new Regex("\"lat\"\\s*:\\s*(-?[0-9.]+)\\s*,\\s*\"lon\"\\s*:\\s*(-?[0-9.]+)");
        int ways = 0; long pts = 0;
        foreach (Match m in geomRe.Matches(text))
        {
            ways++;
            double px = double.NaN, py = double.NaN;
            foreach (Match p in ptRe.Matches(m.Groups[1].Value))
            {
                double lat = double.Parse(p.Groups[1].Value, Inv), lon = double.Parse(p.Groups[2].Value, Inv);
                double x = (lon - west) / dLon, y = (north - lat) / dLat;
                if (!double.IsNaN(px)) Line(g, cols, rows, (int)Math.Floor(px), (int)Math.Floor(py), (int)Math.Floor(x), (int)Math.Floor(y), 1);
                px = x; py = y; pts++;
            }
        }
        text = null;

        var stack = new Stack<int>();
        foreach (var s in seeds.Split(';'))
        {
            var a = s.Split(',');
            double lat = double.Parse(a[0], Inv), lon = double.Parse(a[1], Inv);
            int x = (int)((lon - west) / dLon), y = (int)((north - lat) / dLat);
            if (x >= 0 && y >= 0 && x < cols && y < rows && g[y * cols + x] == 0) { g[y * cols + x] = 2; stack.Push(y * cols + x); }
        }
        while (stack.Count > 0)
        {
            int i = stack.Pop(); int x = i % cols, y = i / cols;
            if (x > 0 && g[i - 1] == 0) { g[i - 1] = 2; stack.Push(i - 1); }
            if (x < cols - 1 && g[i + 1] == 0) { g[i + 1] = 2; stack.Push(i + 1); }
            if (y > 0 && g[i - cols] == 0) { g[i - cols] = 2; stack.Push(i - cols); }
            if (y < rows - 1 && g[i + cols] == 0) { g[i + cols] = 2; stack.Push(i + cols); }
        }

        if (!string.IsNullOrEmpty(carve))
        {
            foreach (var poly in carve.Split('|'))
            {
                var a = poly.Split(',');
                for (int k = 0; k + 3 < a.Length; k += 2)
                {
                    int x0 = (int)((double.Parse(a[k + 1], Inv) - west) / dLon), y0 = (int)((north - double.Parse(a[k], Inv)) / dLat);
                    int x1 = (int)((double.Parse(a[k + 3], Inv) - west) / dLon), y1 = (int)((north - double.Parse(a[k + 2], Inv)) / dLat);
                    Line(g, cols, rows, x0, y0, x1, y1, 2);
                    Line(g, cols, rows, x0 + 1, y0, x1 + 1, y1, 2);
                }
            }
        }

        long sea = 0;
        using (var bmp = new Bitmap(cols, rows, PixelFormat.Format1bppIndexed))
        {
            var pal = bmp.Palette; pal.Entries[0] = Color.Black; pal.Entries[1] = Color.White; bmp.Palette = pal;
            var bd = bmp.LockBits(new Rectangle(0, 0, cols, rows), ImageLockMode.WriteOnly, PixelFormat.Format1bppIndexed);
            byte[] row = new byte[bd.Stride];
            for (int y = 0; y < rows; y++)
            {
                Array.Clear(row, 0, row.Length);
                for (int x = 0; x < cols; x++)
                    if (g[y * cols + x] == 2) { row[x >> 3] |= (byte)(0x80 >> (x & 7)); sea++; }
                Marshal.Copy(row, 0, bd.Scan0 + y * bd.Stride, bd.Stride);
            }
            bmp.UnlockBits(bd);
            bmp.Save(outPng, ImageFormat.Png);
        }
        string meta = string.Format(Inv,
            "{{\"south\":{0},\"west\":{1},\"north\":{2},\"east\":{3},\"cols\":{4},\"rows\":{5},\"dLat\":{6},\"dLon\":{7},\"cellMeters\":{8}}}",
            south, west, north, east, cols, rows, dLat, dLon, cellMeters);
        File.WriteAllText(Path.ChangeExtension(outPng, ".json"), meta);
        return string.Format("ways={0} pts={1} grid={2}x{3} sea={4:P1}", ways, pts, cols, rows, (double)sea / (rows * (double)cols));
    }

    // Same rasterisation, but writes a decorative land image (land = argb colour, sea transparent),
    // supersampled 2x and downscaled for soft edges. Used for the homepage hero.
    public static string LandArt(string jsonPath, string outPng, double south, double west, double north, double east,
                                 double cellMeters, string seeds, int argb)
    {
        string tmp = Path.Combine(Path.GetTempPath(), "landart-mask.png");
        string info = Build(jsonPath, tmp, south, west, north, east, cellMeters, seeds, "");
        using (var mask = new Bitmap(tmp))
        using (var full = new Bitmap(mask.Width, mask.Height, PixelFormat.Format32bppArgb))
        {
            var src = mask.LockBits(new Rectangle(0, 0, mask.Width, mask.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var dst = full.LockBits(new Rectangle(0, 0, mask.Width, mask.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            int n = mask.Width * mask.Height; int[] a = new int[n];
            Marshal.Copy(src.Scan0, a, 0, n);
            for (int i = 0; i < n; i++) a[i] = (a[i] & 0xFF) > 127 ? 0 : argb;
            Marshal.Copy(a, 0, dst.Scan0, n);
            mask.UnlockBits(src); full.UnlockBits(dst);
            int w = mask.Width / 2, h = mask.Height / 2;
            using (var half = new Bitmap(w, h, PixelFormat.Format32bppArgb))
            using (var gr = Graphics.FromImage(half))
            {
                gr.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                gr.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                gr.DrawImage(full, new Rectangle(0, 0, w, h));
                half.Save(outPng, ImageFormat.Png);
            }
        }
        File.Delete(tmp); File.Delete(Path.ChangeExtension(tmp, ".json"));
        return info;
    }

    // Adriatic-wide grid: land from Natural Earth polygons (GeoJSON, rings drawn as lines then flood-filled),
    // with every cell inside the detailed area taken from the fine OSM mask (majority vote), so the two grids agree.
    public static string BuildCoarse(string geojsonPaths, string fineMaskPng, double fS, double fW, double fN, double fE,
                                     string outPng, double south, double west, double north, double east, double cellMeters, string seeds)
    {
        double latMid = (south + north) / 2;
        double dLat = cellMeters / 111320.0, dLon = cellMeters / (111320.0 * Math.Cos(latMid * Math.PI / 180));
        int rows = (int)Math.Ceiling((north - south) / dLat), cols = (int)Math.Ceiling((east - west) / dLon);
        byte[] g = new byte[rows * cols];
        var ser = new System.Web.Script.Serialization.JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        int rings = 0;
        foreach (var path in geojsonPaths.Split('|'))
        {
            var root = (Dictionary<string, object>)ser.DeserializeObject(File.ReadAllText(path));
            foreach (Dictionary<string, object> f in (object[])root["features"])
            {
                var geom = (Dictionary<string, object>)f["geometry"];
                var type = (string)geom["type"];
                var coords = (object[])geom["coordinates"];
                var polys = type == "Polygon" ? new object[] { coords } : coords;
                foreach (object[] poly in polys)
                    foreach (object[] ring in poly)
                    {
                        rings++;
                        double px = double.NaN, py = double.NaN;
                        foreach (object[] p in ring)
                        {
                            double lon = Convert.ToDouble(p[0], Inv), lat = Convert.ToDouble(p[1], Inv);
                            double x = (lon - west) / dLon, y = (north - lat) / dLat;
                            if (!double.IsNaN(px)) Line(g, cols, rows, (int)Math.Floor(px), (int)Math.Floor(py), (int)Math.Floor(x), (int)Math.Floor(y), 1);
                            px = x; py = y;
                        }
                    }
            }
        }
        var stack = new Stack<int>();
        foreach (var s in seeds.Split(';'))
        {
            var a = s.Split(',');
            int x = (int)((double.Parse(a[1], Inv) - west) / dLon), y = (int)((north - double.Parse(a[0], Inv)) / dLat);
            if (x >= 0 && y >= 0 && x < cols && y < rows && g[y * cols + x] == 0) { g[y * cols + x] = 2; stack.Push(y * cols + x); }
        }
        while (stack.Count > 0)
        {
            int i = stack.Pop(); int x = i % cols, y = i / cols;
            if (x > 0 && g[i - 1] == 0) { g[i - 1] = 2; stack.Push(i - 1); }
            if (x < cols - 1 && g[i + 1] == 0) { g[i + 1] = 2; stack.Push(i + 1); }
            if (y > 0 && g[i - cols] == 0) { g[i - cols] = 2; stack.Push(i - cols); }
            if (y < rows - 1 && g[i + cols] == 0) { g[i + cols] = 2; stack.Push(i + cols); }
        }
        // Overwrite the detailed area from the fine mask.
        using (var fine = new Bitmap(fineMaskPng))
        {
            int fw = fine.Width, fh = fine.Height;
            var bd = fine.LockBits(new Rectangle(0, 0, fw, fh), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            int[] fp = new int[fw * fh]; Marshal.Copy(bd.Scan0, fp, 0, fp.Length); fine.UnlockBits(bd);
            double fdLat = (fN - fS) / fh, fdLon = (fE - fW) / fw; // approximate: fine grid spans its bbox
            for (int y = 0; y < rows; y++)
                for (int x = 0; x < cols; x++)
                {
                    double lat0 = north - (y + 1) * dLat, lat1 = north - y * dLat, lon0 = west + x * dLon, lon1 = west + (x + 1) * dLon;
                    if (lat0 < fS || lat1 > fN || lon0 < fW || lon1 > fE) continue;
                    int fy0 = (int)((fN - lat1) / fdLat), fy1 = (int)((fN - lat0) / fdLat), fx0 = (int)((lon0 - fW) / fdLon), fx1 = (int)((lon1 - fW) / fdLon);
                    int seaN = 0, n = 0;
                    for (int yy = fy0; yy < Math.Min(fh, fy1); yy++) for (int xx = fx0; xx < Math.Min(fw, fx1); xx++) { n++; if ((fp[yy * fw + xx] & 0xFF) > 127) seaN++; }
                    if (n > 0) g[y * cols + x] = (byte)(seaN * 2 >= n ? 2 : 0);
                }
        }
        long sea = 0;
        using (var bmp = new Bitmap(cols, rows, PixelFormat.Format1bppIndexed))
        {
            var pal = bmp.Palette; pal.Entries[0] = Color.Black; pal.Entries[1] = Color.White; bmp.Palette = pal;
            var bd = bmp.LockBits(new Rectangle(0, 0, cols, rows), ImageLockMode.WriteOnly, PixelFormat.Format1bppIndexed);
            byte[] row = new byte[bd.Stride];
            for (int y = 0; y < rows; y++)
            {
                Array.Clear(row, 0, row.Length);
                for (int x = 0; x < cols; x++) if (g[y * cols + x] == 2) { row[x >> 3] |= (byte)(0x80 >> (x & 7)); sea++; }
                Marshal.Copy(row, 0, bd.Scan0 + y * bd.Stride, bd.Stride);
            }
            bmp.UnlockBits(bd);
            bmp.Save(outPng, ImageFormat.Png);
        }
        File.WriteAllText(Path.ChangeExtension(outPng, ".json"), string.Format(Inv,
            "{{\"south\":{0},\"west\":{1},\"north\":{2},\"east\":{3},\"cols\":{4},\"rows\":{5},\"dLat\":{6},\"dLon\":{7},\"cellMeters\":{8},\"source\":\"Natural Earth 10m + OSM detail\"}}",
            south, west, north, east, cols, rows, dLat, dLon, cellMeters));
        return string.Format("rings={0} grid={1}x{2} sea={3:P1}", rings, cols, rows, (double)sea / ((double)rows * cols));
    }

    static void Line(byte[] g, int cols, int rows, int x0, int y0, int x1, int y1, byte v)
    {
        int dx = Math.Abs(x1 - x0), dy = -Math.Abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
        while (true)
        {
            if (x0 >= 0 && y0 >= 0 && x0 < cols && y0 < rows) g[y0 * cols + x0] = v;
            if (x0 == x1 && y0 == y1) break;
            int e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }
}
