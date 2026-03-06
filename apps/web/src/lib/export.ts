/**
 * Download a CSV export for a given entity type.
 *
 * @param entityType - One of: candidats, clients, entreprises, mandats
 * @param selectedIds - Optional array of IDs to export only specific entities
 */
export async function downloadCSV(entityType: string, selectedIds?: string[]) {
  const params = new URLSearchParams();
  params.set('format', 'csv');
  if (selectedIds?.length) {
    params.set('ids', selectedIds.join(','));
  }

  const token = localStorage.getItem('accessToken');
  const response = await fetch(`/api/v1/export/${entityType}?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur export' }));
    throw new Error(error.message || `Erreur lors de l'export (${response.status})`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entityType}-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
