document.addEventListener("DOMContentLoaded", function() {
  // Get chart data from the template
  const chartData = JSON.parse(document.getElementById('chartData').textContent);
  
  // Leads Chart (Area)
  const leadsChart = new ApexCharts(document.querySelector("#leadsChart"), {
    chart: { 
      type: 'area', 
      sparkline: { enabled: true }, 
      height: '100%',
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
        animateGradually: {
          enabled: true,
          delay: 150
        },
        dynamicAnimation: {
          enabled: true,
          speed: 350
        }
      }
    },
    stroke: { 
      curve: 'smooth', 
      width: 2 
    },
    fill: { 
      opacity: 0.3,
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.7,
        opacityTo: 0.1,
      }
    },
    colors: ['#00CFE8'],
    series: [{ 
      name: 'Leads',
      data: chartData.lead_trend || [0, 0, 0, 0, 0, 0, 0]
    }],
    tooltip: { 
      enabled: true,
      x: { show: false }
    },
    xaxis: {
      categories: chartData.sales_dates || []
    }
  });

  // Sales Chart (Bar)
  const salesChart = new ApexCharts(document.querySelector("#salesChart"), {
    chart: { 
      type: 'bar', 
      sparkline: { enabled: true }, 
      height: '100%',
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
      }
    },
    plotOptions: { 
      bar: { 
        columnWidth: '60%',
        borderRadius: 4,
        distributed: true,
      } 
    },
    colors: ['#7367F0', '#A66FF0', '#FF9F43', '#EA5455'],
    series: [{
      name: 'Sales',
      data: chartData.sales_trend || [0, 0, 0, 0, 0, 0, 0]
    }],
    tooltip: { 
      enabled: true,
      x: { show: false }
    },
    xaxis: {
      categories: chartData.sales_dates || []
    },
    dataLabels: {
      enabled: false
    }
  });

  // Followups Chart (Line) - Placeholder
  const followupChart = new ApexCharts(document.querySelector("#followupChart"), {
    chart: { 
      type: 'line', 
      sparkline: { enabled: true }, 
      height: '100%',
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
      }
    },
    stroke: { 
      curve: 'smooth', 
      width: 2,
      lineCap: 'round'
    },
    colors: ['#EA5455'],
    series: [{ 
      name: 'Followups',
      data: [1, 1.5, 1.3, 2, 2.8, 2.5, 3] // Placeholder data
    }],
    markers: {
      size: 4,
      strokeWidth: 2,
      hover: {
        size: 5,
      }
    },
    tooltip: { 
      enabled: true,
      x: { show: false },
      marker: {
        show: true
      }
    },
    xaxis: {
      categories: chartData.sales_dates || []
    }
  });

  // Render all charts
  leadsChart.render();
  salesChart.render();
  followupChart.render();

  // Handle window resize
  let resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      leadsChart.updateOptions({});
      salesChart.updateOptions({});
      followupChart.updateOptions({});
    }, 200);
  });
});
