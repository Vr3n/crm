document.addEventListener("DOMContentLoaded", function() {
  const areaOptions = {
    chart: { type: 'area', sparkline: { enabled: true }, height: '100%' },
    stroke: { curve: 'smooth', width: 2 },
    fill: { opacity: 0.3 },
    colors: ['#7367F0'],
    series: [{ data: [2, 3, 2.5, 4, 3, 4.5, 3] }],
    tooltip: { enabled: false }
  };

  const barOptions = {
    chart: { type: 'bar', sparkline: { enabled: true }, height: '100%' },
    plotOptions: { bar: { columnWidth: '60%' } },
    colors: ['#7367F0'],
    series: [{ data: [2, 4, 3, 5, 4, 2, 3] }],
    tooltip: { enabled: false }
  };

  const lineOptions = {
    chart: { type: 'line', sparkline: { enabled: true }, height: '100%' },
    stroke: { curve: 'smooth', width: 2 },
    colors: ['#7367F0'],
    series: [{ data: [1, 1.5, 1.3, 2, 2.8, 2.5, 3] }],
    tooltip: { enabled: false }
  };

  new ApexCharts(document.querySelector("#leadsChart"), areaOptions).render();
  new ApexCharts(document.querySelector("#salesChart"), barOptions).render();
  new ApexCharts(document.querySelector("#followupChart"), lineOptions).render();
})
