/**
 * Utility to convert numbers to Indonesian words (Terbilang)
 */
export function terbilang(n) {
  if (n === 0) return 'Nol';
  
  const words = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  let result = '';
  
  const num = Math.floor(Math.abs(n));
  
  if (num < 12) {
    result = words[num];
  } else if (num < 20) {
    result = terbilang(num - 10) + ' Belas';
  } else if (num < 100) {
    result = terbilang(Math.floor(num / 10)) + ' Puluh ' + terbilang(num % 10);
  } else if (num < 200) {
    result = 'Seratus ' + terbilang(num - 100);
  } else if (num < 1000) {
    result = terbilang(Math.floor(num / 100)) + ' Ratus ' + terbilang(num % 100);
  } else if (num < 2000) {
    result = 'Seribu ' + terbilang(num - 1000);
  } else if (num < 1000000) {
    result = terbilang(Math.floor(num / 1000)) + ' Ribu ' + terbilang(num % 1000);
  } else if (num < 1000000000) {
    result = terbilang(Math.floor(num / 1000000)) + ' Juta ' + terbilang(num % 1000000);
  } else if (num < 1000000000000) {
    result = terbilang(Math.floor(num / 1000000000)) + ' Miliar ' + terbilang(num % 1000000000);
  } else if (num < 1000000000000000) {
    result = terbilang(Math.floor(num / 1000000000000)) + ' Triliun ' + terbilang(num % 1000000000000);
  }
  
  // Cleanup whitespace and "Satu Puluh" -> "Sepuluh" if any, although recursion handles most
  return result.trim().replace(/\s+/g, ' ');
}

export function formatTerbilang(n) {
  const result = terbilang(n);
  return result ? result + ' Rupiah' : '';
}

export function romanize(num) {
  if (isNaN(num)) return '';
  const digits = String(+num).split('');
  const key = [
    '','C','CC','CCC','CD','D','DC','DCC','DCCC','CM',
    '','X','XX','XXX','XL','L','LX','LXX','LXXX','XC',
    '','I','II','III','IV','V','VI','VII','VIII','IX'
  ];
  let roman = '';
  let i = 3;
  while (i--) roman = (key[+digits.pop() + (i * 10)] || '') + roman;
  return Array(+digits.join('') + 1).join('M') + roman;
}
