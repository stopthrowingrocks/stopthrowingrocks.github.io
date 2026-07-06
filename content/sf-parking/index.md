+++
title = "SF Parking Ticket Risk"
date = 2026-04-11

[extra]
subtitle = "How likely are you to get a ticket?"
tab_title = "SF Parking Risk"
+++

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<link rel="stylesheet" href="parking.css">

<p>Select a day and start time. The chart shows the historical distribution of parking citations across the day, and your selected hour is highlighted in blue.</p>

<div id="parking-app">

  <div id="loading"><span class="spinner"></span>Loading citation data from SF Open Data&hellip;</div>

  <div id="controls" hidden>
    <div class="control-group">
      <span class="ctrl-label">Day of week</span>
      <div id="day-buttons" class="btn-group"></div>
    </div>
    <div class="control-group">
      <span class="ctrl-label">Start time: <strong id="time-display"></strong></span>
      <input type="range" id="start-hour" min="0" max="23" value="9" step="1">
    </div>
  </div>

  <div id="chart-container" hidden>
    <div id="chart"></div>
    <div id="chart-x-axis">
      <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span>
    </div>
  </div>

  <div id="result" hidden></div>

  <div id="timeline-container" hidden>
    <p class="timeline-heading"></p>
    <svg id="timeline-svg" viewBox="0 0 600 110" preserveAspectRatio="xMidYMid meet"></svg>
  </div>

  <div id="map-section" hidden>
    <p class="timeline-heading" id="map-heading"></p>
    <div id="map"></div>
    <p class="data-note" id="map-progress"></p>
    <p class="data-note" id="map-note">Location data is most complete through 2020; coverage drops sharply after that. Locations are ordered by citation frequency; the map refines as more pages load.</p>
  </div>

  <p id="data-note" hidden class="data-note"></p>

</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
<script src="parking.js"></script>
