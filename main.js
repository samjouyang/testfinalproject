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

// Add a label
fixedSelectorContainer.append("label")
  .attr("for", "fixed-select")
  .text("Participant: ")
  .style("font-weight", "bold")
  .style("margin-right", "5px");

// Add the select element
const fixedSelect = fixedSelectorContainer.append("select")
  .attr("id", "fixed-select")
  .style("padding", "3px")
  .style("border-radius", "3px");

d3.csv("combined_data.csv", d => {
  for (let key in d) {
    if (key !== "Subject" && key !== "Phase" && !key.startsWith("Unnamed")) {
      d[key] = +d[key]; // Convert numeric values
    }
  }
  return d;
}).then(data => {
  // Remove any Unnamed columns
  data = data.map(d => {
    const cleaned = {};
    for (let key in d) {
      if (!key.startsWith("Unnamed")) cleaned[key] = d[key];
    }
    return cleaned;
  });

  // Extract unique subjects and measurements
  const subjects = [...new Set(data.map(d => d.Subject))];
  const measurements = ["Blood_pressure", "right_MCA_BFV", "left_MCA_BFV", "resp_uncalibrated"];
  const phases = ["Resting", "Preparing", "Standing", "Sitting"];
  currentSubject = subjects[0];

  // Populate subject dropdown (original one)
  const subjectSelect = d3.select("#subject-select");
  subjectSelect.selectAll("option")
    .data(subjects)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => `Subject ${d.slice(-2)}`);
    
  // Populate the fixed subject dropdown
  fixedSelect.selectAll("option")
    .data(subjects)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => `Subject ${d.slice(-2)}`);

  // Attach event listener for original subject selection
  d3.select("#subject-select").on("change", function () {
    currentSubject = this.value;
    // Update the fixed selector to match
    d3.select("#fixed-select").property("value", currentSubject);
    updateAllVisualizations();
  });
  
  // Attach event listener for fixed subject selection
  d3.select("#fixed-select").on("change", function () {
    currentSubject = this.value;
    // Update the original selector to match
    d3.select("#subject-select").property("value", currentSubject);
    updateAllVisualizations();
  });
  
  // Function to update all visualizations
  function updateAllVisualizations() {
    updateTimeSeries(currentSubject);
    updatePhaseSummary(currentSubject, d3.select(".phase-btn.active").text() === "Rest" ? "Resting" : d3.select(".phase-btn.active").text() === "Stand-Up" ? "Standing" : "Sitting");
    updateCorrelation(currentSubject, d3.select("#var1-select").property("value"), d3.select("#var2-select").property("value"));
    updateOxygenation(currentSubject, +d3.select("#oxygen-slider").property("value"));
    updateAnimatedJourney(currentSubject);
    updateUserProfile();
  }

  // Handle user profile form submission
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

  // --- Brain Oxygenation Heatmap ---
  function updateOxygenation(subject, timeIndex) {
    const svg = d3.select("#brainOxygenationChart").html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const subjectData = data.filter(d => d.Subject === subject).sort((a, b) => a.Time - b.Time);
    const oxyData = subjectData.map(d => ({ Time: d.Time, Oxy: (d.i1_850 + d.i1_805) / 2 }));
    const maxIndex = Math.min(timeIndex, oxyData.length - 1);

    const x = d3.scaleLinear().domain(d3.extent(oxyData, d => d.Time)).range([0, width]);
    const y = d3.scaleLinear().domain(d3.extent(oxyData, d => d.Oxy)).range([height, 0]);

    svg.append("path")
      .datum(oxyData)
      .attr("fill", "none")
      .attr("stroke", "#2ecc71")
      .attr("stroke-width", 2)
      .attr("d", d3.line().x(d => x(d.Time)).y(d => y(d.Oxy)));

    svg.append("circle")
      .attr("cx", x(oxyData[maxIndex].Time))
      .attr("cy", y(oxyData[maxIndex].Oxy))
      .attr("r", 5)
      .attr("fill", "#e74c3c");

    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d => d / 60));
    svg.append("g").call(d3.axisLeft(y));
  }

  // --- Animated Physiological Journey ---
  let animationInterval;
  function updateAnimatedJourney(subject) {
    const svg = d3.select("#animatedJourneyChart").html("")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const subjectData = data.filter(d => d.Subject === subject).sort((a, b) => a.Time - b.Time);
    const x = d3.scaleLinear().domain(d3.extent(subjectData, d => d.Time)).range([0, width]);
    const y = d3.scaleLinear().domain(d3.extent(subjectData, d => d.Blood_pressure)).range([height, 0]);

    svg.append("path")
      .datum(subjectData)
      .attr("fill", "none")
      .attr("stroke", "#e74c3c")
      .attr("stroke-width", 2)
      .attr("d", d3.line().x(d => x(d.Time)).y(d => y(d.Blood_pressure)));

    const cursor = svg.append("circle")
      .attr("r", 5)
      .attr("fill", "#3498db");

    let i = 0;
    function animate() {
      cursor.attr("cx", x(subjectData[i].Time))
        .attr("cy", y(subjectData[i].Blood_pressure));
      d3.select("#journey-text").text(
        `At ${(subjectData[i].Time / 60).toFixed(1)} min: BP = ${subjectData[i].Blood_pressure.toFixed(1)} mmHg, Phase: ${subjectData[i].Phase} – And your body initiates its response, but note the brief lag.`
      );
      i = (i + 1) % subjectData.length;
    }

    d3.select("#play-btn").on("click", () => { 
      if (!animationInterval) animationInterval = setInterval(animate, 50); 
    });
    d3.select("#pause-btn").on("click", () => { 
      clearInterval(animationInterval); 
      animationInterval = null; 
    });
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
      .text(d => d.value.toFixed(1) + " mmHg");
  }

  // --- Gamified Quiz ---
  function setupQuiz() {
    // Create quiz container with questions (excluding the third question)
    d3.select("#quiz-container").html(`
      <div class="quiz-section">
        <div class="quiz-question">
          <h4>Question 1: When you stand up, what happens to brain blood flow velocity (BFV)?</h4>
          <div class="quiz-options">
            <button id="quiz-q1-up" class="quiz-btn">It increases</button>
            <button id="quiz-q1-down" class="quiz-btn">It decreases</button>
            <button id="quiz-q1-steady" class="quiz-btn">It stays the same</button>
          </div>
          <div id="quiz-result-1" class="quiz-result"></div>
        </div>
        
        <div class="quiz-question">
          <h4>Question 2: What typically happens to blood pressure immediately after standing?</h4>
          <div class="quiz-options">
            <button id="quiz-q2-up" class="quiz-btn">It increases</button>
            <button id="quiz-q2-down" class="quiz-btn">It decreases</button>
            <button id="quiz-q2-steady" class="quiz-btn">It stays the same</button>
          </div>
          <div id="quiz-result-2" class="quiz-result"></div>
        </div>
        
        <div class="quiz-question">
          <h4>Question 3: What's the relationship between blood pressure and brain blood flow?</h4>
          <div class="quiz-options">
            <button id="quiz-q3-direct" class="quiz-btn">Directly proportional</button>
            <button id="quiz-q3-inverse" class="quiz-btn">Inversely proportional</button>
            <button id="quiz-q3-complex" class="quiz-btn">Complex relationship</button>
          </div>
          <div id="quiz-result-3" class="quiz-result"></div>
        </div>
        
        <div class="quiz-question">
          <h4>Question 4: Why is the initial drop in blood pressure when standing up potentially dangerous?</h4>
          <div class="quiz-options">
            <button id="quiz-q4-a" class="quiz-btn">It can cause fainting</button>
            <button id="quiz-q4-b" class="quiz-btn">It damages blood vessels</button>
            <button id="quiz-q4-c" class="quiz-btn">It has no real danger</button>
          </div>
          <div id="quiz-result-4" class="quiz-result"></div>
        </div>
      </div>
    `);
    
    // Add event listeners for each question separately
    // Question 1
    d3.select("#quiz-q1-up").on("click", function() {
      d3.select("#quiz-result-1")
        .attr("class", "quiz-result correct-answer")
        .html("✓ Correct! As you stand, BFV increases to compensate for the drop in blood pressure.");
      highlightButton(this, true);
    });
    
    d3.select("#quiz-q1-down").on("click", function() {
      d3.select("#quiz-result-1")
        .attr("class", "quiz-result incorrect-answer")
        .html("✗ Not quite. BFV typically rises rather than drops to maintain brain perfusion.");
      highlightButton(this, false);
    });
    
    d3.select("#quiz-q1-steady").on("click", function() {
      d3.select("#quiz-result-1")
        .attr("class", "quiz-result incorrect-answer")
        .html("✗ Not quite. There's a significant change in BFV when standing.");
      highlightButton(this, false);
    });
    
    // Question 2
    d3.select("#quiz-q2-up").on("click", function() {
      d3.select("#quiz-result-2")
        .attr("class", "quiz-result incorrect-answer")
        .html("✗ Not quite. Blood pressure typically drops briefly when standing due to gravity.");
      highlightButton(this, false);
    });
    
    d3.select("#quiz-q2-down").on("click", function() {
      d3.select("#quiz-result-2")
        .attr("class", "quiz-result correct-answer")
        .html("✓ Correct! Blood pressure initially drops when standing due to gravity pulling blood away from the brain.");
      highlightButton(this, true);
    });
    
    d3.select("#quiz-q2-steady").on("click", function() {
      d3.select("#quiz-result-2")
        .attr("class", "quiz-result incorrect-answer")
        .html("✗ Incorrect. There's a noticeable change in blood pressure when standing.");
      highlightButton(this, false);
    });
    
    // Question 3 (previously Question 4)
    d3.select("#quiz-q3-direct").on("click", function() {
      d3.select("#quiz-result-3")
        .attr("class", "quiz-result incorrect-answer")
        .html("✗ Not exactly. While they're related, it's not a simple direct relationship.");
      highlightButton(this, false);
    });
    
    d3.select("#quiz-q3-inverse").on("click", function() {
      d3.select("#quiz-result-3")
        .attr("class", "quiz-result incorrect-answer")
        .html("✗ Not quite. They don't always move in opposite directions.");
      highlightButton(this, false);
    });
    
    d3.select("#quiz-q3-complex").on("click", function() {
      d3.select("#quiz-result-3")
        .attr("class", "quiz-result correct-answer")
        .html("✓ Correct! The body uses complex regulatory mechanisms to maintain brain perfusion despite BP changes.");
      highlightButton(this, true);
    });
    
    // Question 4 (previously Question 5)
    d3.select("#quiz-q4-a").on("click", function() {
      d3.select("#quiz-result-4")
        .attr("class", "quiz-result correct-answer")
        .html("✓ Correct! The initial drop can reduce brain blood flow enough to cause dizziness or fainting, especially in some individuals.");
      highlightButton(this, true);
    });
    
    d3.select("#quiz-q4-b").on("click", function() {
      d3.select("#quiz-result-4")
        .attr("class", "quiz-result incorrect-answer")
        .html("✗ Not quite. Brief blood pressure changes don't typically damage vessels.");
      highlightButton(this, false);
    });
    
    d3.select("#quiz-q4-c").on("click", function() {
      d3.select("#quiz-result-4")
        .attr("class", "quiz-result incorrect-answer")
        .html("✗ Incorrect. The drop can be dangerous, especially for elderly or those with autonomic dysfunction.");
      highlightButton(this, false);
    });
  }
  
  // Helper function to highlight selected buttons
  function highlightButton(button, isCorrect) {
    // Reset all buttons in the same question group
    const parent = d3.select(button.parentNode);
    parent.selectAll(".quiz-btn")
      .classed("selected-correct", false)
      .classed("selected-incorrect", false);
    
    // Highlight the clicked button
    d3.select(button)
      .classed(isCorrect ? "selected-correct" : "selected-incorrect", true);
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

  // Attach event listeners for the four checkboxes explicitly
  d3.select("#bp-check").on("change", () => updateTimeSeries(currentSubject));
  d3.select("#rbfv-check").on("change", () => updateTimeSeries(currentSubject));
  d3.select("#lbfv-check").on("change", () => updateTimeSeries(currentSubject));
  d3.select("#resp-check").on("change", () => updateTimeSeries(currentSubject));

  // Listeners for other interactive elements
  d3.selectAll(".phase-btn").on("click", function() {
    d3.selectAll(".phase-btn").classed("active", false);
    d3.select(this).classed("active", true);
    updatePhaseSummary(currentSubject, this.textContent === "Rest" ? "Resting" : this.textContent === "Stand-Up" ? "Standing" : "Sitting");
  });

  d3.select("#var1-select").on("change", () => updateCorrelation(currentSubject, d3.select("#var1-select").property("value"), d3.select("#var2-select").property("value")));
  d3.select("#var2-select").on("change", () => updateCorrelation(currentSubject, d3.select("#var1-select").property("value"), d3.select("#var2-select").property("value")));

  d3.select("#oxygen-slider").attr("max", data.filter(d => d.Subject === currentSubject).length - 1)
    .on("input", () => updateOxygenation(currentSubject, +d3.select("#oxygen-slider").property("value")));

  // Initialize visualizations
  updateTimeSeries(currentSubject);
  updatePhaseSummary(currentSubject, "Resting");
  updateCorrelation(currentSubject, "Blood_pressure", "right_MCA_BFV");
  updateOxygenation(currentSubject, 0);
  updateAnimatedJourney(currentSubject);
  setupQuiz();
  setupScrollytelling();
});

// Add some CSS for the quiz
d3.select("head").append("style").html(`
  .quiz-section {
    margin: 20px 0;
    padding: 15px;
    background-color: #f8f9fa;
    border-radius: 8px;
  }
  .quiz-question {
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e0e0e0;
  }
  .quiz-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 15px 0;
  }
  .quiz-btn {
    padding: 10px 20px;
    background-color: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 14px;
  }
  .quiz-btn:hover {
    background-color: #e0e0e0;
  }
  .quiz-result {
    margin-top: 15px;
    padding: 12px;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 500;
    background-color: #f8f9fa;
    border-left: 4px solid #ddd;
  }
  .selected-correct {
    background-color: #d4edda;
    border-color: #c3e6cb;
  }
  .selected-incorrect {
    background-color: #f8d7da;
    border-color: #f5c6cb;
  }
  .correct-answer {
    background-color: #d4edda;
    border-left-color: #28a745;
    color: #155724;
  }
  .incorrect-answer {
    background-color: #f8d7da;
    border-left-color: #dc3545;
    color: #721c24;
  }
`);

// Interactive Intro Experience
document.addEventListener('DOMContentLoaded', function() {
  const step0 = document.getElementById('intro-step-0');
  const step1 = document.getElementById('intro-step-1');
  const step2 = document.getElementById('intro-step-2');
  const step3 = document.getElementById('intro-step-3');
  const step4 = document.getElementById('intro-step-4');
  const sitProgress = document.getElementById('sit-progress');
  const startButton = document.getElementById('start-experiment');
  const beginButton = document.getElementById('begin-exploration');
  const introSection = document.getElementById('interactive-intro');
  const mainContent = document.getElementById('main-content');
  
  // Hide main content initially
  mainContent.style.opacity = '0';
  
  // Start button event listener
  startButton.addEventListener('click', function() {
    // Transition from step 0 to step 1
    step0.classList.add('hidden');
    setTimeout(() => {
      step0.style.display = 'none';
      step1.style.display = 'block';
      
      setTimeout(() => {
        step1.classList.remove('hidden');
        
        // Start the sitting countdown
        let progress = 0;
        const sitTimer = setInterval(() => {
          progress += 1;
          sitProgress.style.width = `${progress}%`;
          
          if (progress >= 100) {
            clearInterval(sitTimer);
            
            // Transition to step 2
            step1.classList.add('hidden');
            setTimeout(() => {
              step1.style.display = 'none';
              step2.style.display = 'block';
              
              // Rest of the existing animation sequence continues...
              setTimeout(() => {
                step2.classList.remove('hidden');
                
                // Animate the standing up
                setTimeout(() => {
                  const sitFigure = document.querySelector('.figure.sit');
                  const standFigure = document.querySelector('.figure.stand');
                  const arrow = document.querySelector('.arrow');
                  
                  sitFigure.style.opacity = '0';
                  standFigure.style.opacity = '1';
                  arrow.style.opacity = '1';
                  
                  // Transition to step 3 after standing animation
                  setTimeout(() => {
                    step2.classList.add('hidden');
                    setTimeout(() => {
                      step2.style.display = 'none';
                      step3.style.display = 'block';
                      
                      setTimeout(() => {
                        step3.classList.remove('hidden');
                        
                        // Transition to step 4 after a few seconds
                        setTimeout(() => {
                          step3.classList.add('hidden');
                          setTimeout(() => {
                            step3.style.display = 'none';
                            step4.style.display = 'block';
                            
                            setTimeout(() => {
                              step4.classList.remove('hidden');
                            }, 100);
                          }, 800);
                        }, 5000);
                      }, 100);
                    }, 800);
                  }, 2000);
                }, 1000);
              }, 100);
            }, 800);
          }
        }, 100); // 10 seconds total (100 * 100ms)
      }, 100);
    }, 800);
  });
  
  // Begin exploration button (existing code)
  beginButton.addEventListener('click', function() {
    // Fade out intro
    introSection.style.opacity = '0';
    
    // Fade in main content
    setTimeout(() => {
      introSection.style.display = 'none';
      mainContent.style.opacity = '1';
      
      // Trigger any initialization needed for your visualizations
      window.dispatchEvent(new Event('resize')); // Helps D3 visualizations render correctly
    }, 1000);
  });
  
  // Allow skipping the intro with ESC key (existing code)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && introSection.style.display !== 'none') {
      introSection.style.opacity = '0';
      setTimeout(() => {
        introSection.style.display = 'none';
        mainContent.style.opacity = '1';
        window.dispatchEvent(new Event('resize'));
      }, 500);
    }
  });
});