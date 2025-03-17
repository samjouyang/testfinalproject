// Chart dimensions
const margin = { top: 20, right: 80, bottom: 50, left: 50 };
const width = 960 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

// Global variables for user profile and current subject
let userBP = null;
let userHR = null;
let currentSubject = null;

// Create a fixed position container for the subject selector
const fixedSelectorContainer = d3.select("body")
  .append("div")
  .attr("id", "fixed-subject-selector")
  .style("position", "fixed")
  .style("top", "10px")
  .style("right", "10px")
  .style("background-color", "white")
  .style("padding", "10px")
  .style("border-radius", "5px")
  .style("box-shadow", "0 2px 5px rgba(0,0,0,0.2)")
  .style("z-index", "1000");

fixedSelectorContainer.append("label")
  .attr("for", "fixed-select")
  .text("Participant: ")
  .style("font-weight", "bold")
  .style("margin-right", "5px");

const fixedSelect = fixedSelectorContainer.append("select")
  .attr("id", "fixed-select")
  .style("padding", "3px")
  .style("border-radius", "3px");

// Helper function: Compute linear regression and correlation coefficient
function computeRegression(data, xKey, yKey) {
  const n = data.length;
  const sumX = d3.sum(data, d => d[xKey]);
  const sumY = d3.sum(data, d => d[yKey]);
  const meanX = sumX / n;
  const meanY = sumY / n;
  
  let numerator = 0, denomX = 0, denomY = 0;
  data.forEach(d => {
    const dx = d[xKey] - meanX;
    const dy = d[yKey] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  });
  const slope = numerator / denomX;
  const intercept = meanY - slope * meanX;
  const r = numerator / Math.sqrt(denomX * denomY);
  return { slope, intercept, r };
}

d3.csv("combined_data.csv", d => {
  for (let key in d) {
    if (key !== "Subject" && key !== "Phase" && !key.startsWith("Unnamed")) {
      d[key] = +d[key];
    }
  }
  return d;
}).then(data => {
  data = data.map(d => {
    const cleaned = {};
    for (let key in d) {
      if (!key.startsWith("Unnamed")) cleaned[key] = d[key];
    }
    return cleaned;
  });

  const subjects = [...new Set(data.map(d => d.Subject))];
  const measurements = ["Blood_pressure", "right_MCA_BFV", "left_MCA_BFV", "resp_uncalibrated"];
  currentSubject = subjects[0];

  const subjectSelect = d3.select("#subject-select");
  // Filter out any subjects that don't have digits in their ID
  const validSubjects = subjects.filter(d => /\d+/.test(d));

  subjectSelect.selectAll("option")
    .data(validSubjects)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => {
      const match = d.match(/\d+/);
      const numeric = parseInt(match[0], 10);
      return `Subject ${numeric}`;
    });

  // Use only validSubjects for the fixed select as well
  fixedSelect.selectAll("option")
    .data(validSubjects)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => {
      const match = d.match(/\d+/);
      const numeric = parseInt(match[0], 10);
      return `Subject ${numeric}`;
    });

  d3.select("#subject-select").on("change", function () {
    currentSubject = this.value;
    d3.select("#fixed-select").property("value", currentSubject);
    updateAllVisualizations();
  });
  
  d3.select("#fixed-select").on("change", function () {
    currentSubject = this.value;
    d3.select("#subject-select").property("value", currentSubject);
    updateAllVisualizations();
  });
  
  function updateAllVisualizations() {
    updateTimeSeries(currentSubject);
    updatePhaseSummary(currentSubject, d3.select(".phase-btn.active").text() === "Rest" ? "Resting" : d3.select(".phase-btn.active").text() === "Stand-Up" ? "Standing" : "Sitting");
    updateCorrelation(currentSubject, d3.select("#var1-select").property("value"), d3.select("#var2-select").property("value"));
    updateUserProfile();
  }

  d3.select("#profile-form").on("submit", function(event) {
    event.preventDefault();
    userBP = +d3.select("#user-bp").property("value");
    userHR = +d3.select("#user-hr").property("value");
    updateUserProfile();
    updateTimeSeries(currentSubject);
  });

  function updateTimeSeries(subject) {
    const svg = d3.select("#timeSeriesChart").html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right + 100) // Increased width for legend
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const subjectData = data.filter(d => d.Subject === subject).sort((a, b) => a.Time - b.Time);
    const x = d3.scaleLinear().domain(d3.extent(subjectData, d => d.Time)).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(subjectData, d => Math.max(d.Blood_pressure, d.right_MCA_BFV, d.left_MCA_BFV, d.resp_uncalibrated))]).range([height, 0]);

    // Define phase boundaries based on the data
    const phaseTransitions = {
      restToStand: subjectData.find(d => d.Phase === "Standing")?.Time || (x.domain()[0] + (x.domain()[1] - x.domain()[0]) * 0.4),
      standToSit: subjectData.find(d => d.Phase === "Sitting")?.Time || (x.domain()[0] + (x.domain()[1] - x.domain()[0]) * 0.7)
    };

    // Define the phases with actual time values
    const phases = [
      { name: "Rest Phase", start: x.domain()[0], end: phaseTransitions.restToStand, color: "rgba(200, 230, 200, 0.3)" },
      { name: "Stand-Up Phase", start: phaseTransitions.restToStand, end: phaseTransitions.standToSit, color: "rgba(230, 200, 200, 0.3)" },
      { name: "Sit-Down Phase", start: phaseTransitions.standToSit, end: x.domain()[1], color: "rgba(200, 200, 230, 0.3)" }
    ];

    // Add background highlights for each phase
    phases.forEach(phase => {
      svg.append('rect')
        .attr('x', x(phase.start))
        .attr('y', 0)
        .attr('width', x(phase.end) - x(phase.start))
        .attr('height', height)
        .attr('fill', phase.color)
        .attr('class', 'phase-highlight');
    });
    
    // Remove the phase labels from the top of the chart
    // (We'll add them to the legend instead)

    // Create ticks at 5-minute intervals (300 seconds) and ensure final tick is the domain end
    const tickInterval = 300;
    const domainStart = x.domain()[0];
    const domainEnd = x.domain()[1];
    const tickStart = Math.ceil(domainStart / tickInterval) * tickInterval;
    let tickValues = d3.range(tickStart, domainEnd, tickInterval);
    tickValues.push(domainEnd);

    // Define lines to plot with corresponding checkbox IDs
    const lines = [
        { key: "Blood_pressure", color: "#e74c3c", id: "bp-check", label: "Blood Pressure"},
        { key: "right_MCA_BFV", color: "#3498db", id: "rbfv-check", label: "Right Brain Blood Flow"},
        { key: "left_MCA_BFV", color: "#c842f5", id: "lbfv-check", label: "Left Brain Blood Flow"},
        // { key: "resp_uncalibrated", color: "#2ecc71", id: "resp-check", label: "Respiratory Pattern"}
      ];

    // For each variable, check if its checkbox is checked before drawing its line
    lines.forEach(line => {
      if (d3.select(`#${line.id}`).property("checked")) {
        svg.append("path")
          .datum(subjectData)
          .attr("fill", "none")
          .attr("stroke", line.color)
          .attr("stroke-width", 2)
          .attr("opacity", 0.7)
          .attr("d", d3.line().x(d => x(d.Time)).y(d => y(d[line.key])));
      }
    });

    // Add tooltip container
    const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("opacity", 0)
      .style("position", "absolute")
      .style("background-color", "white")
      .style("border", "1px solid #ddd")
      .style("border-radius", "3px")
      .style("padding", "8px")
      .style("pointer-events", "none")
      .style("font-size", "12px")
      .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)");

    // Add invisible overlay for tooltip interaction
    const bisect = d3.bisector(d => d.Time).left;
    
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mousemove", function(event) {
        const mouseX = d3.pointer(event)[0];
        const x0 = x.invert(mouseX);
        const i = bisect(subjectData, x0, 1);
        const d0 = subjectData[i - 1];
        const d1 = subjectData[i] || d0;
        const d = x0 - d0.Time > d1.Time - x0 ? d1 : d0;
        
        // Position the tooltip
        tooltip
          .style("opacity", 0.9)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px")
          .html(`
            <strong>Time:</strong> ${(d.Time / 60).toFixed(1)} min<br>
            <strong>Phase:</strong> ${d.Phase}<br>
            ${d3.select("#bp-check").property("checked") ? 
              `<span style="color: #e74c3c">BP: ${d.Blood_pressure.toFixed(1)} mmHg</span><br>` : ""}
            ${d3.select("#rbfv-check").property("checked") ? 
              `<span style="color: #3498db">Right BFV: ${d.right_MCA_BFV.toFixed(1)}</span><br>` : ""}
            ${d3.select("#lbfv-check").property("checked") ? 
              `<span style="color: #c842f5">Left BFV: ${d.left_MCA_BFV.toFixed(1)}</span>` : ""}
          `);
          
        // Add a vertical line at mouse position
        svg.selectAll(".tooltip-line").remove();
        svg.append("line")
          .attr("class", "tooltip-line")
          .attr("x1", mouseX)
          .attr("x2", mouseX)
          .attr("y1", 0)
          .attr("y2", height)
          .attr("stroke", "#999")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "3,3");
      })
      .on("mouseout", function() {
        tooltip.style("opacity", 0);
        svg.selectAll(".tooltip-line").remove();
      });

    // Add vertical lines at phase transitions but without text labels
    svg.append('line')
      .attr('x1', x(phaseTransitions.restToStand))
      .attr('x2', x(phaseTransitions.restToStand))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#e74c3c')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,5');
    
    svg.append('line')
      .attr('x1', x(phaseTransitions.standToSit))
      .attr('x2', x(phaseTransitions.standToSit))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#3498db')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,5');

    // Draw x axis with tick labels in minutes
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x)
        .tickValues(tickValues)
        .tickFormat(d => d / 60))
      .append("text")
      .attr("x", width / 2)
      .attr("y", 40)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .text("Time (minutes)");

    // Draw y axis
    svg.append("g")
      .call(d3.axisLeft(y))
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -40)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .text("Value");

    // Create a unified legend container positioned further to the right
    const legendContainer = svg.append('g')
      .attr('transform', `translate(${width + 40}, 10)`); // Adjusted position for more space
    
    // Add measurement legend
    const measurementLegend = legendContainer.append('g');
    
    // Add title for measurements
    measurementLegend.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .style('font-weight', 'bold')
      .style('font-size', '12px')
      .text('Measurements:');
    
    // Add measurement items to legend with increased spacing
    lines.forEach((line, i) => {
      const g = measurementLegend.append('g')
        .attr('transform', `translate(0, ${i * 25 + 20})`); // Increased vertical spacing
      
      g.append('line')
        .attr('x1', 0)
        .attr('x2', 15)
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', line.color)
        .attr('stroke-width', 2);
      
      g.append('text')
        .attr('x', 20)
        .attr('y', 4)
        .style('font-size', '11px')
        .text(line.label);
    });
    
    // Add phase legend below measurement legend
    const phaseLegend = legendContainer.append('g')
      .attr('transform', `translate(0, ${lines.length * 20 + 30})`);
    
    phaseLegend.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .style('font-weight', 'bold')
      .style('font-size', '12px')
      .text('Phases:');
    
    // Add phase items to legend
    phases.forEach((phase, i) => {
      const g = phaseLegend.append('g')
        .attr('transform', `translate(0, ${i * 20 + 15})`);
      
      g.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', phase.color)
        .attr('stroke', '#999')
        .attr('stroke-width', 0.5);
      
      g.append('text')
        .attr('x', 20)
        .attr('y', 12)
        .style('font-size', '11px')
        .text(phase.name);
    });
    
    // Add transition markers to legend
    const transitionLegend = legendContainer.append('g')
      .attr('transform', `translate(0, ${lines.length * 20 + phases.length * 20 + 60})`);
    
    transitionLegend.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .style('font-weight', 'bold')
      .style('font-size', '12px')
      .text('Transitions:');
    
    // Stand Up transition
    const standUpG = transitionLegend.append('g')
      .attr('transform', 'translate(0, 15)');
    
    standUpG.append('line')
      .attr('x1', 0)
      .attr('x2', 15)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#e74c3c')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,5');
    
    standUpG.append('text')
      .attr('x', 20)
      .attr('y', 4)
      .style('font-size', '11px')
      .text('Stand Up');
    
    // Sit Down transition
    const sitDownG = transitionLegend.append('g')
      .attr('transform', 'translate(0, 35)');
    
    sitDownG.append('line')
      .attr('x1', 0)
      .attr('x2', 15)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#3498db')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,5');
    
    sitDownG.append('text')
      .attr('x', 20)
      .attr('y', 4)
      .style('font-size', '11px')
      .text('Sit Down');

    // Overlay user's resting blood pressure if provided
    if (userBP !== null) {
      svg.append("line")
        .attr("x1", 0)
        .attr("y1", y(userBP))
        .attr("x2", width)
        .attr("y2", y(userBP))
        .attr("stroke", "purple")
        .attr("stroke-width", 2)
        .style("stroke-dasharray", ("3, 3"));

      svg.append("text")
        .attr("x", width - 100)
        .attr("y", y(userBP) - 10)
        .attr("fill", "purple")
        .text("Your Resting BP");
    }

    d3.select("#ts-annotation").html(`
      <p><strong>What You're Seeing:</strong> This graph shows how your body responds to standing up and sitting down. 
      When you stand, notice how blood pressure initially dips, followed by a compensatory increase in brain blood flow. 
      This brief delay reveals the critical moments when your body works to maintain brain perfusion despite gravity's challenge.</p>
    `);
  }


  function updatePhaseSummary(subject, phase) {
    const svg = d3.select("#phaseSummaryChart").html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Filter data for the selected subject across all phases
    const subjectData = data.filter(d => d.Subject === subject);
    const phaseData = subjectData.filter(d => d.Phase === phase);
    
    // Filter out "resp_uncalibrated" from measurements
    const filteredMeasurements = measurements.filter(m => m !== "resp_uncalibrated");

    const averages = filteredMeasurements.map(m => ({ key: m, value: d3.mean(phaseData, d => d[m]) }));

    // Calculate the maximum value for the y-axis scale based on the entire subject data
    const maxValue = d3.max(subjectData, d => Math.max(d.Blood_pressure, d.right_MCA_BFV, d.left_MCA_BFV));

    const x = d3.scaleBand().domain(filteredMeasurements).range([0, width]).padding(0.1);
    const yScale = d3.scaleLinear().domain([0, maxValue / 1.5]).range([height, 0]); // Use maxValue from all phases

    svg.selectAll(".bar")
      .data(averages)
      .enter()
      .append("rect")
      .attr("x", d => x(d.key))
      .attr("y", d => yScale(d.value))
      .attr("width", x.bandwidth())
      .attr("height", d => height - yScale(d.value))
      .attr("fill", "#3498db");

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(yScale));
}


  // --- Correlation Explorer ---
  function updateCorrelation(subject, var1, var2) {
    const svg = d3.select("#correlationChart").html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const subjectData = data.filter(d => d.Subject === subject);
    const x = d3.scaleLinear().domain(d3.extent(subjectData, d => d[var1])).range([0, width]);
    const y = d3.scaleLinear().domain(d3.extent(subjectData, d => d[var2])).range([height, 0]);

    svg.selectAll(".dot")
      .data(subjectData)
      .enter()
      .append("circle")
      .attr("cx", d => x(d[var1]))
      .attr("cy", d => y(d[var2]))
      .attr("r", 3)
      .attr("fill", "#e74c3c");

    // Compute regression and add trend line
    const { slope, intercept, r } = computeRegression(subjectData, var1, var2);
    const xRange = d3.extent(subjectData, d => d[var1]);
    svg.append("line")
      .attr("x1", x(xRange[0]))
      .attr("x2", x(xRange[1]))
      .attr("y1", y(intercept + slope * xRange[0]))
      .attr("y2", y(intercept + slope * xRange[1]))
      .attr("stroke", "black")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4");

    // Add correlation coefficient text on the chart
    svg.append("text")
      .attr("x", width - 100)
      .attr("y", 20)
      .attr("fill", "#333")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text(`r = ${r.toFixed(2)}`);

    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .append("text")
      .attr("x", width / 2)
      .attr("y", 40)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .text(var1);

    svg.append("g")
      .call(d3.axisLeft(y))
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -40)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .text(var2);
  }

  // --- Your Personal Profile ---
  function updateUserProfile() {
    const subjectData = data.filter(d => d.Subject === currentSubject && d.Phase === "Resting");
    const avgBP = d3.mean(subjectData, d => d.Blood_pressure);
    const svg = d3.select("#profileChart").html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const bars = [
      { label: "Dataset Avg BP", value: avgBP },
      { label: "Your Resting BP", value: userBP }
    ];
    const x = d3.scaleBand().domain(bars.map(d => d.label)).range([0, width]).padding(0.4);
    const yScale = d3.scaleLinear().domain([0, d3.max(bars, d => d.value)]).range([height, 0]);

    svg.selectAll(".bar")
      .data(bars)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.label))
      .attr("y", d => yScale(d.value))
      .attr("width", x.bandwidth())
      .attr("height", d => height - yScale(d.value))
      .attr("fill", d => d.label === "Your Resting BP" ? "#8e44ad" : "#3498db");

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(yScale));

    svg.selectAll("text.label")
      .data(bars)
      .enter()
      .append("text")
      .attr("class", "label")
      .attr("x", d => x(d.label) + x.bandwidth() / 2)
      .attr("y", d => yScale(d.value) - 5)
      .attr("text-anchor", "middle")
      .text(d => d.value ? d.value.toFixed(1) + " mmHg" : "N/A");

    // Display personalized insight (percentile ranking)
    const bpValues = subjectData.map(d => d.Blood_pressure);
    const rank = bpValues.filter(v => userBP && (v < userBP)).length;
    const percentile = userBP ? ((rank / bpValues.length) * 100).toFixed(1) : "N/A";
    d3.select("#profile-feedback").html(userBP ? `<p>Your resting BP is in the ${percentile} percentile of the dataset.</p>` : "");
  }

  // --- Scrollytelling ---
  function setupScrollytelling() {
    const sections = d3.selectAll(".scroll-section");
    window.addEventListener("scroll", () => {
      const scrollPos = window.scrollY + window.innerHeight / 2;
      sections.each(function() {
        const section = d3.select(this);
        const top = this.offsetTop;
        const bottom = top + this.offsetHeight;
        section.classed("active", scrollPos >= top && scrollPos <= bottom);
      });
    });
  }

  // Attach event listeners for checkboxes and variable selectors
  d3.select("#bp-check").on("change", () => updateTimeSeries(currentSubject));
  d3.select("#rbfv-check").on("change", () => updateTimeSeries(currentSubject));
  d3.select("#lbfv-check").on("change", () => updateTimeSeries(currentSubject));
  d3.select("#var1-select").on("change", () => updateCorrelation(currentSubject, d3.select("#var1-select").property("value"), d3.select("#var2-select").property("value")));
  d3.select("#var2-select").on("change", () => updateCorrelation(currentSubject, d3.select("#var1-select").property("value"), d3.select("#var2-select").property("value")));

  d3.selectAll(".phase-btn").on("click", function() {
    d3.selectAll(".phase-btn").classed("active", false);
    d3.select(this).classed("active", true);
    updatePhaseSummary(currentSubject, this.textContent === "Rest" ? "Resting" : this.textContent === "Stand-Up" ? "Standing" : "Sitting");
  });

  // Initialize visualizations
  updateTimeSeries(currentSubject);
  updatePhaseSummary(currentSubject, "Resting");
  updateCorrelation(currentSubject, "Blood_pressure", "right_MCA_BFV");
  setupQuiz();
  setupScrollytelling();
});

// =============================
// New Interactive Human Body Visualization Features
// =============================

// Function to update the human body visualization based on time (in seconds)
function updateBodyVisualization(time) {
  // Update displayed time in the slider info
  const sliderTimeElem = document.getElementById("sliderTime");
  if (sliderTimeElem) {
    sliderTimeElem.textContent = time;
  }
  
  // Define phase thresholds (in seconds):
  // Rest: 0 - 600 sec (0-10 min)
  // Stand: 600 - 1200 sec (10-20 min)
  // Sit: 1200 - 1800 sec (20-30 min)
  const restPhase = 600;
  const standPhase = 1200;

  let heartRate, bloodPressure, brainFlow, brainColor, figureTranslation;

  if (time <= restPhase) {
    // Rest phase
    heartRate = 70;
    bloodPressure = "120/80";
    brainFlow = 100;
    brainColor = "#3498db"; // blue
    figureTranslation = 0;
  } else if (time <= standPhase) {
    // Standing phase: elevated heart rate and brain flow, slight BP dip
    heartRate = 85;
    bloodPressure = "115/75";
    brainFlow = 110;
    brainColor = "#ff9800"; // orange-ish indicating activation
    // Interpolate upward movement: at time=600, 0px; at time=1200, -20px
    figureTranslation = -20 * ((time - restPhase) / (standPhase - restPhase));
  } else {
    // Sitting phase: recovery
    heartRate = 75;
    bloodPressure = "120/80";
    brainFlow = 100;
    brainColor = "#3498db"; // back to blue
    // Interpolate back down: at time=1200, -20px; at time=1800, 0px
    figureTranslation = -20 + 20 * ((time - standPhase) / (1800 - standPhase));
  }

  // Update the displayed internal numbers
  const heartRateElem = document.getElementById("heartRate");
  if (heartRateElem) heartRateElem.textContent = heartRate;
  const bloodPressureElem = document.getElementById("bloodPressure");
  if (bloodPressureElem) bloodPressureElem.textContent = bloodPressure;
  const brainFlowElem = document.getElementById("brainFlow");
  if (brainFlowElem) brainFlowElem.textContent = brainFlow;

  // Update the brain color in the SVG
  const brainElem = document.getElementById("brain");
  if (brainElem) {
    brainElem.setAttribute("fill", brainColor);
  }

  // Update the overall figure position (simulate slight movement)
  const humanSVG = document.getElementById("humanSVG");
  if (humanSVG) {
    humanSVG.style.transform = `translateY(${figureTranslation}px)`;
  }
}

// Setup the time slider interaction
document.addEventListener('DOMContentLoaded', function() {
  const timeSlider = document.getElementById("timeSlider");
  if (timeSlider) {
    // When the user moves the slider, update the visualization
    timeSlider.addEventListener("input", function() {
      const currentTime = +this.value; // slider value in seconds
      updateBodyVisualization(currentTime);
    });
  }
  
  // OPTIONAL: Automatic progression (uncomment to enable)
  /*
  let autoProgress = true;
  let currentTime = 0;
  const totalTime = 1800; // 30 minutes in seconds
  const interval = 1000; // update every second

  setInterval(() => {
    if (autoProgress && timeSlider) {
      currentTime = (currentTime + 1) % (totalTime + 1);
      timeSlider.value = currentTime;
      updateBodyVisualization(currentTime);
    }
  }, interval);

  // If user interacts with the slider, disable auto progression:
  timeSlider.addEventListener("input", function() {
    autoProgress = false;
  });
  */
});

// Add clickable interactivity to the heart element
document.addEventListener('DOMContentLoaded', function() {
  const heartElem = document.getElementById("heart");
  if (heartElem) {
    heartElem.addEventListener("click", function() {
      // Create a modal to display detailed heart information
      let modal = document.createElement("div");
      modal.id = "detailModal";
      // Basic modal styling; you may want to move this to your CSS file for better organization
      modal.style.position = "fixed";
      modal.style.top = "50%";
      modal.style.left = "50%";
      modal.style.transform = "translate(-50%, -50%)";
      modal.style.background = "#fff";
      modal.style.border = "1px solid #ddd";
      modal.style.padding = "20px";
      modal.style.boxShadow = "0 2px 5px rgba(0,0,0,0.3)";
      modal.style.zIndex = 2000;
      modal.innerHTML = `
        <h3>Heart Details</h3>
        <p>Current Heart Rate: ${document.getElementById("heartRate") ? document.getElementById("heartRate").textContent : 'N/A'} bpm</p>
        <p>Heart Rate Variability: 5%</p>
        <button id="closeModal">Close</button>
      `;
      document.body.appendChild(modal);

      // Close button handler
      document.getElementById("closeModal").addEventListener("click", function() {
        modal.remove();
      });
    });
  }
});

// =============================
// End New Interactive Human Body Visualization Features
// =============================


// --- Interactive Intro Experience ---
document.addEventListener('DOMContentLoaded', function() {
  const steps = {
    0: document.getElementById('intro-step-0'),
    1: document.getElementById('intro-step-1'),
    2: document.getElementById('intro-step-2'),
    3: document.getElementById('intro-step-3'),
    4: document.getElementById('intro-step-4')
  };
  
  const elements = {
    sitProgress: document.getElementById('sit-progress'),
    startButton: document.getElementById('start-experiment'),
    beginButton: document.getElementById('begin-exploration'),
    introSection: document.getElementById('interactive-intro'),
    mainContent: document.getElementById('main-content')
  };
  
  // Hide main content initially
  elements.mainContent.style.opacity = '0';
  
  function transitionToStep(fromStep, toStep, delay = 800) {
    steps[fromStep].classList.add('hidden');
    setTimeout(() => {
      steps[fromStep].style.display = 'none';
      steps[toStep].style.display = 'block';
      setTimeout(() => {
        steps[toStep].classList.remove('hidden');
      }, 100);
    }, delay);
  }
  
  elements.startButton.addEventListener('click', function() {
    transitionToStep(0, 1);
    let progress = 0;
    const sitTimer = setInterval(() => {
      progress += 1;
      elements.sitProgress.style.width = `${progress}%`;
      if (progress >= 100) {
        clearInterval(sitTimer);
        transitionToStep(1, 2);
        setTimeout(() => {
          const sitFigure = document.querySelector('.figure.sit');
          const standFigure = document.querySelector('.figure.stand');
          setTimeout(() => {
            sitFigure.style.opacity = '0';
            standFigure.style.opacity = '1';
            setTimeout(() => {
              transitionToStep(2, 3);
              setTimeout(() => {
                transitionToStep(3, 4);
              }, 5000);
            }, 2000);
          }, 500);
        }, 1000);
      }
    }, 100);
  });

  elements.beginButton.addEventListener('click', function() {
    elements.introSection.style.opacity = '0';
    setTimeout(() => {
      elements.introSection.style.display = 'none';
      elements.mainContent.style.opacity = '1';
      window.dispatchEvent(new Event('resize'));
    }, 1000);
  });
  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && elements.introSection.style.display !== 'none') {
      elements.introSection.style.opacity = '0';
      setTimeout(() => {
        elements.introSection.style.display = 'none';
        elements.mainContent.style.opacity = '1';
        window.dispatchEvent(new Event('resize'));
      }, 500);
    }
  });
});

// --- Gamified Quiz ---
function setupQuiz() {
  document.querySelectorAll('.quiz-btn').forEach(button => {
    button.addEventListener('click', function() {
      const questionDiv = this.closest('.quiz-question');
      const resultDiv = questionDiv.querySelector('.quiz-result');
      const isCorrect = this.hasAttribute('data-correct');
      
      questionDiv.querySelectorAll('.quiz-btn').forEach(btn => {
        btn.classList.remove('selected-correct', 'selected-incorrect');
      });
      
      this.classList.add(isCorrect ? 'selected-correct' : 'selected-incorrect');
      resultDiv.className = `quiz-result ${isCorrect ? 'correct-answer' : 'incorrect-answer'}`;
      resultDiv.innerHTML = this.getAttribute('data-feedback');
    });
  });
}
