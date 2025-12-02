import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export default function App() {
  const [seriesName, setSeriesName] = useState('SERIE-A');
  const [prefix, setPrefix] = useState('A');
  const [startFolio, setStartFolio] = useState(1);
  const [count, setCount] = useState(10);
  const [price, setPrice] = useState(100);

  const [tickets, setTickets] = useState(() => {
    try {
      const raw = localStorage.getItem('tickets_v1');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  });

  const [savedSeries, setSavedSeries] = useState(() => {
    try { return JSON.parse(localStorage.getItem('saved_series_v1') || '[]'); } catch { return []; }
  });

  const [dark, setDark] = useState(() => (localStorage.getItem('pref_dark') === '1'));
  const containerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('tickets_v1', JSON.stringify(tickets));
  }, [tickets]);

  useEffect(() => {
    localStorage.setItem('saved_series_v1', JSON.stringify(savedSeries));
  }, [savedSeries]);

  useEffect(() => {
    localStorage.setItem('pref_dark', dark ? '1' : '0');
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [dark]);

  async function makeQR(text) {
    try {
      return await QRCode.toDataURL(text, { margin: 1, width: 300 });
    } catch (e) {
      console.error('QR error', e);
      return '';
    }
  }

  async function generate() {
    const newTickets = [];
    let folio = Number(startFolio);
    for (let i = 0; i < Number(count); i++) {
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
      const fol = folio + i;
      const code = `${seriesName}-${prefix}${String(fol).padStart(4,'0')}`;
      const payload = JSON.stringify({ code, price, createdAt: new Date().toISOString() });
      const qr = await makeQR(payload);
      newTickets.push({ id, series: seriesName, prefix, folio: fol, price: Number(price), sold: false, code, qrDataUrl: qr });
    }
    setTickets(prev => [...newTickets, ...prev]);
  }

  function saveSeries() {
    if (!seriesName) return;
    const exists = savedSeries.find(s => s.name === seriesName);
    if (exists) return;
    setSavedSeries(prev => [{ name: seriesName, prefix }, ...prev]);
  }

  function useSavedSeries(name) {
    const s = savedSeries.find(x => x.name === name);
    if (!s) return;
    setSeriesName(s.name);
    setPrefix(s.prefix);
  }

  function removeSeries(name) {
    setSavedSeries(prev => prev.filter(s => s.name !== name));
  }

  function markSold(id){ setTickets(prev => prev.map(t => t.id === id ? {...t, sold:true} : t)); }
  function markUnsold(id){ setTickets(prev => prev.map(t => t.id === id ? {...t, sold:false} : t)); }
  function clearAll(){ if(!confirm('Limpiar todos los boletos?')) return; setTickets([]); }
  function bulkMarkSold(){ setTickets(prev => prev.map(t => ({...t, sold:true}))); }

  async function downloadTicketPNG(ticket) {
    const node = document.getElementById('ticket-' + ticket.id);
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 2 });
    const data = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data;
    a.download = `${ticket.code}.png`;
    a.click();
  }

  async function downloadTicketPDF(ticket) {
    const node = document.getElementById('ticket-' + ticket.id);
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 2 });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [canvas.width, canvas.height] });
    pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${ticket.code}.pdf`);
  }

  async function downloadAllPNGZip() {
    const zip = new JSZip();
    for (const t of tickets) {
      const node = document.getElementById('ticket-' + t.id);
      if (!node) continue;
      const canvas = await html2canvas(node, { scale: 2 });
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      zip.file(`${t.code}.png`, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url; 
    a.download = `${seriesName || 'tickets'}.zip`; 
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportAllPDF() {
    const pdf = new jsPDF('p','pt','a4');
    let first = true;
    for (const t of tickets) {
      const node = document.getElementById('ticket-' + t.id);
      if (!node) continue;
      const canvas = await html2canvas(node, { scale: 2 });
      const img = canvas.toDataURL('image/png');
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(img, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
    }
    pdf.save(`${seriesName || 'tickets'}.pdf`);
  }

  function exportExcel(){
    const wsData = [ ['Code','Series','Prefix','Folio','Price','Sold'] ];
    for (const t of tickets) wsData.push([t.code,t.series,t.prefix,t.folio,t.price,t.sold ? 'Yes':'No']);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
    const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `${seriesName || 'tickets'}.xlsx`; 
    a.click(); 
    URL.revokeObjectURL(url);
  }

  const total = tickets.length;
  const soldCount = tickets.filter(t => t.sold).length;
  const available = total - soldCount;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">

        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Generador de Boletos — PWA</h1>

          <div className="flex items-center gap-3">
            <label className="items-center flex gap-2">
              <input type="checkbox" checked={dark} onChange={() => setDark(d => !d)} />
              Modo oscuro
            </label>

            <button 
              className="btn"
              onClick={()=>{
                navigator.serviceWorker?.register?.('/service-worker.js').catch(()=>{});
                alert('Service worker registrado (si existe)');
              }}
            >
              Registrar SW
            </button>
          </div>
        </header>

        <section className="grid md:grid-cols-3 gap-4 mb-6">
          
          {/* Generador */}
          <div className="col-span-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h2 className="font-semibold mb-2">Generar boletos</h2>

            <div className="grid sm:grid-cols-2 gap-2">
              <input className="p-2 rounded border" value={seriesName} onChange={e=>setSeriesName(e.target.value)} placeholder="Nombre de serie" />
              <input className="p-2 rounded border" value={prefix} onChange={e=>setPrefix(e.target.value)} placeholder="Prefijo" />
              <input type="number" className="p-2 rounded border" value={startFolio} onChange={e=>setStartFolio(e.target.value)} placeholder="Folio inicial" />
              <input type="number" className="p-2 rounded border" value={count} onChange={e=>setCount(e.target.value)} placeholder="Cantidad" />
              <input type="number" className="p-2 rounded border" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Precio" />

              <div className="flex gap-2">
                <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={generate}>Generar</button>
                <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={saveSeries}>Guardar serie</button>
              </div>
            </div>

            <div className="mt-3">
              <strong>Series guardadas:</strong>
              <div className="flex gap-2 mt-2 flex-wrap">
                {savedSeries.map(s => (
                  <div key={s.name} className="bg-gray-200 dark:bg-gray-700 p-2 rounded flex items-center gap-2">
                    <button onClick={()=>useSavedSeries(s.name)} className="underline">{s.name}</button>
                    <span className="text-xs">({s.prefix})</span>
                    <button onClick={()=>removeSeries(s.name)} className="text-red-500 text-sm ml-2">x</button>
                  </div>
                ))}
                {savedSeries.length===0 && <span className="text-sm text-gray-500">— ninguna —</span>}
              </div>
            </div>
          </div>

          {/* Panel de control */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h2 className="font-semibold mb-2">Panel de control</h2>

            <div className="grid gap-2">
              <div>Total generados: <strong>{total}</strong></div>
              <div>Vendidos: <strong>{soldCount}</strong></div>
              <div>Disponibles: <strong>{available}</strong></div>

              <div className="mt-3 flex gap-2">
                <button className="px-2 py-1 bg-yellow-500 rounded" onClick={bulkMarkSold}>Marcar todos vendidos</button>
                <button className="px-2 py-1 bg-red-500 rounded" onClick={clearAll}>Limpiar</button>
                <button className="px-2 py-1 bg-indigo-600 rounded" onClick={() => {
                  const sel = tickets.filter(t=>!t.sold).slice(0,1);
                  if(sel[0]) markSold(sel[0].id);
                }}>Vender 1</button>
              </div>
            </div>

            <div className="mt-3">
              <strong>Exportaciones rápidas</strong>
              <div className="flex gap-2 mt-2">
                <button className="px-2 py-1 bg-blue-600 rounded text-white" onClick={downloadAllPNGZip}>Descargar PNG (todos)</button>
                <button className="px-2 py-1 bg-green-600 rounded text-white" onClick={exportAllPDF}>Exportar PDF (todos)</button>
                <button className="px-2 py-1 border rounded" onClick={exportExcel}>Exportar Excel</button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl mb-3">Boletos</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" ref={containerRef}>
            {tickets.map(t => (
              <article 
                key={t.id} 
                id={'ticket-'+t.id} 
                className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow relative"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{t.series}</div>
                    <div className="text-lg font-bold">{t.code}</div>
                    <div className="text-sm">Folio: {t.folio}</div>
                  </div>

                  <div style={{width:110, height:110}}>
                    <img src={t.qrDataUrl} alt="QR" style={{width:'100%',height:'100%'}} />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm">Precio</div>
                    <div className="font-semibold">${t.price}</div>
                  </div>

                  <div>
                    {t.sold 
                      ? <span className="px-2 py-1 bg-red-600 text-white rounded">Vendido</span>
                      : <span className="px-2 py-1 bg-green-600 text-white rounded">Disponible</span>}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button className="px-2 py-1 border rounded" onClick={()=>downloadTicketPNG(t)}>PNG</button>
                  <button className="px-2 py-1 border rounded" onClick={()=>downloadTicketPDF(t)}>PDF</button>

                  {!t.sold 
                    ? <button className="px-2 py-1 bg-yellow-500 rounded" onClick={()=>markSold(t.id)}>Marcar vendido</button>
                    : <button className="px-2 py-1 bg-gray-600 rounded" onClick={()=>markUnsold(t.id)}>Desmarcar</button>
                  }

                  <button className="px-2 py-1 text-sm text-red-600" onClick={() => 
                    setTickets(prev => prev.filter(x => x.id !== t.id))
                  }>
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
