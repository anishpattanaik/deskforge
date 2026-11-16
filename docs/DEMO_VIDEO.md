# Demo video script (about 2.5 min)

1. **Hook (10 s).** Show the real messy desk, then the printed tray with everything in it.
   "One photo became this in about a minute."
2. **Problem (15 s).** Off-the-shelf organizers don't fit *your* stuff, and designing one in CAD takes hours.
3. **Snap (15 s).** Pick the scale reference, take a photo (webcam or phone) and drop it into DeskForge.
   The scan animation plays. Mention it runs on a free local AI on your laptop GPU.
4. **Analyse (25 s).** Walk through the result: summary, clutter score, the green "Scaled from a bank card" chip,
   items with confidence, cables with diameters. Say the AI returns *schema-validated JSON*, not prose.
5. **Ask for changes (20 s).** Type "add a pocket for my watch and engrave APEX on the front".
   The ✓ list comes from a real diff, and impossible asks ("add a hinged lid") are reported honestly. Click Undo.
6. **Tune (35 s), the money shot.** Hover a card and its pocket lights up. Drag a slider and the tray rebuilds
   live (draft in about 1 s, labelled build a few seconds later). Untick the keys and the layout repacks. Switch the
   bed to Ender 3 and it repacks to fit. Turn on Turntable and Wireframe.
7. **Under the hood (25 s).** Scroll the website's 3D story (x-ray scan, pockets lighting up, layer-by-layer print),
   then the architecture: vision AI → layout packer (3 orientations × 6 row widths) → CadQuery
   (shared walls, filleted scoops, engraved labels, snap-fit cable clips) → STL.
8. **Print (20 s).** Click Download STL, show the slicer, then a time-lapse clip of the print.
9. **Close (10 s).** Put the items in the printed tray and snap a cable into its clip.

Tips: record at 1440p with the browser zoomed to 110%. Start the print early. Cut the ~1 min local-AI wait
in editing (or keep the timer visible to prove it's real). **Try the demo desk** gives the same flow instantly.
