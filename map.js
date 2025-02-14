mapboxgl.accessToken = 'pk.eyJ1IjoiYW5tYXJrb3ZhIiwiYSI6ImNsc3A3NGN0bzBtNXcycmxybGY0cTEwaXEifQ.VrX381MXt-D5EkQjBBIomQ';

// // Initialize the map
// const map = new mapboxgl.Map({
//   container: 'map', // ID of the div where the map will render
//   style: 'mapbox://styles/mapbox/streets-v12', // Map style
//   center: [-71.092761, 42.357575], // [longitude, latitude]
//   zoom: 12, // Initial zoom level
//   minZoom: 5, // Minimum allowed zoom
//   maxZoom: 18 // Maximum allowed zoom
// });

// map.addSource('boston_route', {
//   type: 'geojson',
//   data: 'Existing_Bike_Network_2022.geojson'
// });

// map.addLayer({
//   id: 'bike-lanes',
//   type: 'line',
//   source: 'boston_route',
//   paint: {
//     'line-color': 'green',
//     'line-width': 3,
//     'line-opacity': 0.4
//   }
// });
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.092761, 42.357575], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

(async () => {
  await new Promise((resolve) => map.on('load', resolve));

  map.addSource('boston_route', {
    type: 'geojson',
    data: 'Existing_Bike_Network_2022.geojson'
  });
  
  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });

  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': 'green',
      'line-width': 3,
      'line-opacity': 0.4
    }
  });

  map.addLayer({
    id: 'bike-lanes2', // this relabeling is important
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': 'green',
      'line-width': 3,
      'line-opacity': 0.4
    }
  });

})();

const svg = d3.select('#map').select('svg');
let stations = [];
let circles;
let results;
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point);  // Project to pixel coordinates
  return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

// Function to update circle positions when the map moves/zooms
function updatePositions() {
  circles
    .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
    .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
}

map.on('load', () => {
  // Load the nested JSON file
  d3.json('./bluebikes-stations.json').then(jsonData => {

  console.log('Loaded JSON Data:', jsonData);
  stations = jsonData.data.stations;
  console.log('Stations Array:', stations); 
  }).catch(error => {
    console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
  }); // Log to verify structure
  result = d3.csv('./bluebikes-traffic-2024-03.csv').then(trips => {
    departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id,
    );

    arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id,
    )

    for (let trip of trips) {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.started_at);
      let startedMinutes = minutesSinceMidnight(trip.started_at);
      departuresByMinute[startedMinutes].push(trip);
      let endedMinutes = minutesSinceMidnight(trip.ended_at);
      arrivalsByMinute[endedMinutes].push(trip);
    }

    stations = stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });
    let radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);
    console.log('Loaded CSV Data:', trips);
    console.log('Stations Array:', stations);
    //moved from the previous map.on('load') function, I have no clue if this was intended.
    circles = svg.selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic))               // Radius of the circle
    .attr('fill', 'steelblue')  // Circle fill color
    .attr('stroke', 'white')    // Circle border color
    .attr('stroke-width', 1) 
    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) // 6.1!!!
    .each(function(d) {
      // Add <title> for browser tooltips
      d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });   // Circle border thickness
    // .attr('opacity', 1);      // Circle opacity

  // Initial position update when map loads
  updatePositions();
    // updatePositions();
  return trips;
  }).catch(error => {
    console.error('Error loading CSV:', error);
  });
});

// Reposition markers on map interactions
map.on('move', updatePositions);     // Update during map movement
map.on('zoom', updatePositions);     // Update during zooming
map.on('resize', updatePositions);   // Update on window resize
map.on('moveend', updatePositions);  // Final adjustment after movement ends

let timeFilter = -1;
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);  // Get slider value

  if (timeFilter === -1) {
    selectedTime.textContent = '';  // Clear time display
    anyTimeLabel.style.display = 'block';  // Show "(any time)"
  } else {
    selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
    anyTimeLabel.style.display = 'none';  // Hide "(any time)"
  }

  // Trigger filtering logic
  filterTripsByTime();
}

timeSlider.addEventListener('input', updateTimeDisplay);

let filteredTrips = [];
let filteredStations = [];
let filteredArrivals = [];
let filteredDepartures = [];
let filteredTraffic = [];

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsByTime() {
  result.then(trips => {
  filteredTrips = 
  timeFilter === -1
    ? trips
    : trips.filter((trip) => {
        let startedMinutes = minutesSinceMidnight(trip.started_at);
        let endedMinutes = minutesSinceMidnight(trip.ended_at);
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });
  filteredArrivals = 
  filterByMinute(arrivalsByMinute, timeFilter)
  // d3.rollup(
  //   filteredTrips,
  //   (v) => v.length,
  //   (d) => d.end_station_id
  // );
  filteredDepartures = 
  filterByMinute(departuresByMinute, timeFilter)
  // d3.rollup(
  //   filteredTrips,
  //   (v) => v.length,
  //   (d) => d.start_station_id
  // );
  filteredStations = stations.map(station => {
      let station_copy = {...station};
      let id = station.short_name;
      station_copy.arrivals = filteredArrivals.get(id) ?? 0;
      station_copy.departures = filteredDepartures.get(id) ?? 0;
      station_copy.totalTraffic = station_copy.arrivals + station_copy.departures;
      // station_copy.arrivals = filteredArrivals.filter(trip => trip.end_station_id === id).length;
      // station_copy.departures = filteredDepartures.filter(trip => trip.start_station_id === id).length;
      return station_copy;

    });
    console.log('Filtered Trips:', filteredArrivals);
    let min = timeFilter === -1 ? 0 : 3;
    let max = timeFilter === -1 ? 25 : 50;

    let radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
    .range([min, max]);

    svg.selectAll('circle').remove()
    circles = svg.selectAll('circle')
    .data(filteredStations)
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic)) // Radius of the circle
    .attr('fill', 'steelblue')  // Circle fill color
    .attr('stroke', 'white')    // Circle border color
    .attr('stroke-width', 1)
    .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic)) //6.1!!!
    .each(function(d) {
      // Add <title> for browser tooltips
      d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });
    updatePositions(); 
}).catch (error => {
  console.error('Error filtering trips:', error);
});
}

function filterByMinute(tripsByMinute, minute) {
  // Normalize both to the [0, 1439] range
  // % is the remainder operator: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

