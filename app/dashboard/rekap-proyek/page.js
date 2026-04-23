'use client';

export const dynamic = 'force-dynamic';

import React, { useCallback, useEffect, useMemo, useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  Camera, MapPin, ClipboardList, Activity, Package, Factory,
  LayoutGrid, ChevronRight, Users, BarChart2, Clock, CalendarDays, Zap, FileSpreadsheet,
  TrendingUp, Trash2, Save, Plus, LogOut, Copy, Check, UserMinus, Settings2, Settings, Tag, ShieldCheck
} from 'lucide-react';
import {
  BarChart, Bar, Cell
} from 'recharts';
import CalendarModal from './CalendarModal';
import ProgressTab from '@/components/tabs/ProgressTab';
import Spinner from '@/components/Spinner';
import Empty from '@/components/Empty';
import AhspTab from '@/components/tabs/AhspTab';
import HargaTab from '@/components/tabs/HargaTab';
import DataTerpakaiTab from '@/components/tabs/DataTerpakaiTab';
import DataPerubahanTab from '@/components/tabs/DataPerubahanTab';
import TkdnTab from '@/components/tabs/TkdnTab';
import DokTab from '@/components/tabs/DokTab';
import ExportImportTab from '@/components/tabs/ExportImportTab';
import ScheduleTab from '@/components/ScheduleTab';
import RabEditorTab from '@/components/tabs/RabEditorTab';
import BackupVolumeTab from '@/components/tabs/BackupVolumeTab';
import LocationSelect from '@/components/LocationSelect';
import { addDays, computeManpower, getSequencedSchedule } from '@/lib/manpower';

function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(n || 0);
}

function safeFormatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return '—';
  }
}

function fmt(n) { return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }); }

const romanToInt = (s) => {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const current = map[s[i].toUpperCase()] || 0;
    const next = map[s[i + 1]?.toUpperCase()] || 0;
    if (next > current) { total += next - current; i++; }
    else { total += current; }
  }
  return total;
};

const getBabWeight = (bab) => {
  if (!bab) return 999;
  const s = bab.toUpperCase().trim();
  const parts = s.split(/[\s.]+/);
  if (parts[0] === 'BAB' && parts[1] && /^[IVXLCDM]+$/.test(parts[1])) return romanToInt(parts[1]);
  if (/^[IVXLCDM]+$/.test(parts[0])) return romanToInt(parts[0]);
  const babMatch = s.match(/BAB\s+([IVXLCDM]+)/);
  if (babMatch) return romanToInt(babMatch[1]);
  const arabicMatch = s.match(/\d+/);
  if (arabicMatch) return parseInt(arabicMatch[0]);
  return 999;
};

const TABS = [
  { id: 'daftar', label: 'Data Proyek', icon: LayoutGrid, desc: 'Kelola semua proyek Anda' },
  { id: 'proyek', label: 'PROYEK', icon: ClipboardList, desc: 'Kelola RAB & Jadwal Pekerjaan' },
  { id: 'progress', label: 'Progress', icon: TrendingUp, desc: 'Input harian Volume, Bahan, Alat & Tenaga' },
  { id: 'terpakai', label: 'Data Terpakai', icon: Package, desc: 'Rekap AHSP dan Komponen yang digunakan' },
  { id: 'perubahan', label: 'Data Perubahan', icon: Activity, desc: 'Kelola CCO dan Mutual Check (MC)' },
  { id: 'tkdn', label: 'TKDN', icon: Factory, desc: 'Rekapitulasi persentase TKDN dari seluruh material' },
  { id: 'dok', label: 'Dokumentasi', icon: Camera, desc: 'Foto lapangan dan keterangan GPS' },
  { id: 'export', label: 'Export / Import', icon: FileSpreadsheet, desc: 'Ekspor laporan RAB atau Impor dari format Excel' },
];

function ProyekContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const isCheckingAuth = React.useRef(false);
  const [activeTab, setActiveTab] = useState('daftar');
  const [subTabProyek, setSubTabProyek] = useState('rab'); // rab | schedule
  const [tabData, setTabData] = useState({
    ahsp: [], harga: [], tkdn: null, dok: [],
    schedule: { lines: [], resources: [] },
    cco: [], mc: [],
    backup: [],
  });
  const [tabLoading, setTabLoading] = useState(false);
  const [selectedBab, setSelectedBab] = useState('all');
  const [laborSettings, setLaborSettings] = useState({});
  const [ahspCatalog, setAhspCatalog] = useState({});
  const [mpTargetDurasi, setMpTargetDurasi] = useState(0);
  const [itemWorkers, setItemWorkers] = useState({});
  const pathname = usePathname();
  const [itemDurasi, setItemDurasi] = useState({});
  const [savingField, setSavingField] = useState(null);
  const [scheduleRange, setScheduleRange] = useState(60);
  const [showCalendar, setShowCalendar] = useState(false);
  const [startDates, setStartDates] = useState({});
  const [projectStartDate, setProjectStartDate] = useState('');
  const [progressViewMode, setProgressViewMode] = useState('volume'); // volume, material, labor
  const [progressTimeRange, setProgressTimeRange] = useState(90); // 90, 180, 365

  const [terpakaiSubTab, setTerpakaiSubTab] = useState('ahsp'); // ahsp | harga
  const [terpakaiResFilter, setTerpakaiResFilter] = useState('all'); // all | tenaga | bahan | alat
  const [perubahanSubTab, setPerubahanSubTab] = useState('cco'); // cco | mc
  const [activeCcoVersion, setActiveCcoVersion] = useState(null); // { type, total }
  const [statusSimpan, setStatusSimpan] = useState('ready'); // saving, saved, ready

  const [projectMembers, setProjectMembers] = useState([]);
  const [userSlotRole, setUserSlotRole] = useState(null);
  const [projectOwnerId, setProjectOwnerId] = useState(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [allRoles, setAllRoles] = useState({}); // { [projectId]: slot_role }
  const [modalStatus, setModalStatus] = useState(null); // { type: 'success'|'error', msg: string }

  // Refs for performance & stale request prevention
  const [localTotalKontrak, setLocalTotalKontrak] = useState(null);
  const dataVersionRef = useRef(0);
  const tabVersionRef = useRef(0);
  const abortControllerRef = useRef(null);

  // ── Penambahan Logic Hub Informasi ──
  const currentProjectObj = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    return projects.find(p => p.id === selectedProject) || null;
  }, [projects, selectedProject]);

  // ── Unified URL & State Synchronization ──
  useEffect(() => {
    // Skip sync if we are in the middle of a transition or loading
    if (isCreating || isCheckingAuth.current || loading) return;

    try {
      const urlId = searchParams?.get('id');
      
      // 1. Direction: URL -> State
      if (urlId && urlId !== selectedProject) {
        setSelectedProject(urlId);
        if (typeof window !== 'undefined') localStorage.setItem('bc_last_project', urlId);
      } 
      // 2. Direction: State -> URL
      else if (selectedProject && urlId !== selectedProject) {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('id', selectedProject);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        if (typeof window !== 'undefined') localStorage.setItem('bc_last_project', selectedProject);
      }
      // 3. Auto-restore/Default: Jika URL kosong, ambil dari LocalStorage atau proyek pertama
      else if (!urlId && !selectedProject && Array.isArray(projects) && projects.length > 0) {
        const savedId = typeof window !== 'undefined' ? localStorage.getItem('bc_last_project') : null;
        const targetId = (savedId && projects.some(p => p?.id === savedId)) ? savedId : projects[0].id;
        setSelectedProject(targetId);
      }
    } catch (err) {
      console.error('URL Sync Error:', err);
    }
  }, [searchParams, selectedProject, projects, pathname, router, isCreating, loading]);

  const projectMetrics = useMemo(() => {
    if (!currentProjectObj) return { total: 0, duration: 0 };

    // GUC: Jika ada perubahan lokal (unsaved), gunakan itu untuk display header
    if (localTotalKontrak !== null) {
      return { total: localTotalKontrak, duration: currentProjectObj.manual_duration || 0, isCco: false };
    }

    try {
      // 1. If there's an approved CCO, use its total
      if (activeCcoVersion?.total > 0) {
        const subtotal = activeCcoVersion.total;
        const ppn = subtotal * ((currentProjectObj.ppn_percent || 12) / 100);
        const total = Math.ceil((subtotal + ppn) / 1000) * 1000;
        return { total, duration: currentProjectObj.manual_duration || 0, isCco: true, version: activeCcoVersion.type };
      }

      // 2. Fallback to normal AHSP lines total or cached project total
      const subtotal = (tabData.ahsp || []).reduce((sum, line) => sum + (Number(line.jumlah) || 0), 0);
      const ppnPercent = currentProjectObj.ppn_percent ?? 12;
      const ppn = subtotal * (ppnPercent / 100);
      let total = Math.ceil((subtotal + ppn) / 1000) * 1000;

      // If we have no lines yet in tabData, use the cached total from the project object
      if (total === 0 && currentProjectObj.total_kontrak) {
        total = currentProjectObj.total_kontrak;
      }

      return { total, duration: currentProjectObj.manual_duration || 0, isCco: false };
    } catch (e) {
      console.error('Metrics calc error:', e);
      return { total: 0, duration: 0 };
    }
  }, [currentProjectObj, tabData.ahsp, activeCcoVersion, localTotalKontrak]);

  const activeTabObj = useMemo(() => TABS.find(t => t.id === activeTab), [activeTab]);

  const [locations, setLocations] = useState([]);
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [identityForm, setIdentityForm] = useState({
    name: '', code: '', location: '', location_id: '', fiscal_year: '', contract_number: '', hsp_value: 0, manual_duration: 0, ppn_percent: 12,
    program_name: '', activity_name: '', work_name: '',
    ppk_name: '', ppk_nip: '', pptk_name: '', pptk_nip: '',
    konsultan_name: '', konsultan_supervisor: '', kontraktor_director: ''
  });
  const [createForm, setCreateForm] = useState({
    name: '', code: '', location: '', location_id: '', fiscal_year: new Date().getFullYear().toString(),
    contract_number: '', hsp_value: 0, manual_duration: 0, ppn_percent: 12,
    program_name: '', activity_name: '', work_name: ''
  });

  // Sinkronisasi Form Identitas saat proyek dipilih
  useEffect(() => {
    // PROTEKSI: Jangan reset form ke kosong jika data proyek sedang dimuat atau belum ada
    if (loading) return;

    if (currentProjectObj) {
      setIdentityForm({
        name: currentProjectObj.name || '',
        code: currentProjectObj.code || '',
        location: currentProjectObj.location || '',
        location_id: currentProjectObj.location_id || '',
        fiscal_year: currentProjectObj.fiscal_year || '',
        contract_number: currentProjectObj.contract_number || '',
        hsp_value: currentProjectObj.hsp_value || 0,
        manual_duration: currentProjectObj.manual_duration || 0,
        ppn_percent: currentProjectObj.ppn_percent || 12,
        program_name: currentProjectObj.program_name || '',
        activity_name: currentProjectObj.activity_name || '',
        work_name: currentProjectObj.work_name || '',
        ppk_name: currentProjectObj.ppk_name || '',
        ppk_nip: currentProjectObj.ppk_nip || '',
        pptk_name: currentProjectObj.pptk_name || '',
        pptk_nip: currentProjectObj.pptk_nip || '',
        konsultan_name: currentProjectObj.konsultan_name || '',
        konsultan_supervisor: currentProjectObj.konsultan_supervisor || '',
        kontraktor_director: currentProjectObj.kontraktor_director || ''
      });
    } else if (!selectedProject) {
      // Hanya reset jika user memang berniat membuat baru atau sudah tidak memilih apapun
      setIdentityForm({
        name: '', code: '', location: '', fiscal_year: new Date().getFullYear().toString(),
        contract_number: '', hsp_value: 0, ppn_percent: 12,
        program_name: '', activity_name: '', work_name: '',
        ppk_name: '', ppk_nip: '', pptk_name: '', pptk_nip: '',
        konsultan_name: '', konsultan_supervisor: '', kontraktor_director: ''
      });
    }
  }, [currentProjectObj, loading, selectedProject]);

  async function handleCreateSubmit(e) {
    if (e) e.preventDefault();
    setIsCreateModalOpen(false);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesi berakhir, silakan login kembali.');

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: createForm.name || createForm.work_name || 'Proyek Baru',
          code: createForm.code,
          location: createForm.location,
          location_id: createForm.location_id || null,
          fiscal_year: createForm.fiscal_year,
          contract_number: createForm.contract_number,
          hsp_value: parseFloat(createForm.hsp_value) || 0,
          ppn_percent: parseFloat(createForm.ppn_percent) || 12,
          program_name: createForm.program_name,
          activity_name: createForm.activity_name,
          work_name: createForm.work_name,
          created_by: session.user.id,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Proyek berhasil dibuat.');
      
      // Update local state first and pass it to loadData to prevent snapping back
      const newProject = { ...data, ahsp_lines: [] };
      setProjects(prev => [newProject, ...prev]);
      setSelectedProject(data.id);
      
      // Update URL & LocalStorage
      const params = new URLSearchParams(searchParams.toString());
      params.set('id', data.id);
      router.push(`${pathname}?${params.toString()}`);
      localStorage.setItem('bc_last_project', data.id);
      
      setIsCreating(false);
      setActiveTab('proyek');
      setSubTabProyek('rab');
      
      // Explicitly pass the new ID to loadData
      loadData(data.id);
    } catch (err) {
      toast.error('Gagal membuat proyek: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateProjectIdentity(e) {
    if (e) e.preventDefault();
    setTabLoading(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          name: identityForm.name,
          code: identityForm.code,
          location: identityForm.location,
          location_id: identityForm.location_id || null,
          fiscal_year: identityForm.fiscal_year,
          contract_number: identityForm.contract_number,
          hsp_value: parseFloat(identityForm.hsp_value) || 0,
          hsp_value: parseFloat(identityForm.hsp_value) || 0,
          ppn_percent: parseFloat(identityForm.ppn_percent) || 12,
          program_name: identityForm.program_name,
          activity_name: identityForm.activity_name,
          work_name: identityForm.work_name,
          ppk_name: identityForm.ppk_name,
          ppk_nip: identityForm.ppk_nip,
          pptk_name: identityForm.pptk_name,
          pptk_nip: identityForm.pptk_nip,
          konsultan_name: identityForm.konsultan_name,
          konsultan_supervisor: identityForm.konsultan_supervisor,
          kontraktor_director: identityForm.kontraktor_director,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedProject);

      if (error) throw error;
      setIsIdentityModalOpen(false);
      toast.success('Identitas proyek berhasil diperbarui.');
      loadData();
    } catch (err) {
      toast.error('Gagal memperbarui identitas proyek: ' + err.message);
    } finally {
      setTabLoading(false);
    }
  }

  // Ambil data personil saat modal share dibuka
  const fetchMembersForProject = useCallback(async (projectId) => {
    if (!projectId) return;
    try {
      const { data, error } = await supabase
        .from('project_members')
        .select('*, members!project_members_user_id_fkey(full_name, email)')
        .eq('project_id', projectId);

      if (error) throw error;
      if (data) {
        setProjectMembers(data);
        const myRow = data.find(m => m.user_id === member?.user_id);
        setUserSlotRole(myRow?.slot_role || null);
      }
    } catch (err) {
      console.error('Error fetching project members:', err);
      // Don't clear state on refresh error to avoid flickering
    }
  }, [member?.user_id]);

  useEffect(() => {
    if (showShareModal?.id) {
      fetchMembersForProject(showShareModal.id);
    }
  }, [showShareModal?.id, fetchMembersForProject]);

  const isExpired = member?.isExpired;
  const isOwner = member?.user_id === projectOwnerId;
  const isAdmin = member?.role === 'admin';
  const isAdvance = member?.role === 'advance';
  const isModeNormal = member?.role === 'normal';

  const canInputProgress = (userSlotRole === 'pembuat' || isOwner) && !isExpired;
  const canApproveFinal = userSlotRole === 'pengecek' || isAdmin || (isOwner && !isModeNormal);
  const canVerify = userSlotRole === 'pembuat' || isAdmin || (isOwner && !isModeNormal);

  const visibleTabs = useMemo(() => {
    const filterRbac = (tabs) => {
      return tabs.filter(t => {
        // 'backup' tab: visible for advance and admin
        if (t.id === 'backup') return isAdmin || member?.role === 'advance';
        return true;
      });
    };

    if (isModeNormal) {
      return filterRbac(TABS.filter(t => ['daftar', 'proyek', 'terpakai', 'export'].includes(t.id)));
    }

    // RBAC: Filter berdasarkan peran di proyek (userSlotRole) atau Admin
    let base = TABS;
    if (!(isAdmin || isOwner)) {
      switch (userSlotRole) {
        case 'pembuat':
          base = TABS.filter(t => ['daftar', 'proyek', 'progress', 'terpakai', 'perubahan', 'tkdn', 'dok', 'export'].includes(t.id)); break;
        case 'pengecek':
          base = TABS.filter(t => ['daftar', 'proyek', 'progress', 'terpakai', 'dok', 'export'].includes(t.id)); break;
        default:
          base = TABS.filter(t => t.id === 'daftar');
      }
    }
    return filterRbac(base);
  }, [isModeNormal, isAdmin, isOwner, userSlotRole, member?.role]);

  const ownedProjectsCount = useMemo(() => projects.filter(p => p.created_by === member?.user_id).length, [projects, member?.user_id]);
  const joinedProjectsCount = useMemo(() => projects.filter(p => p.created_by !== member?.user_id).length, [projects, member?.user_id]);
  const ownedLimitReached = member?.role === 'admin' ? false : (member?.role === 'advance' ? ownedProjectsCount >= 5 : (member?.role === 'pro' ? ownedProjectsCount >= 3 : ownedProjectsCount >= 1));
  const joinedLimitReached = member?.role !== 'admin' && joinedProjectsCount >= 7;

  const [selectedBackupLineId, setSelectedBackupLineId] = useState(null);

  const loadData = useCallback(async (forcedId = null) => {
    if (isCheckingAuth.current) return;
    isCheckingAuth.current = true;
    const version = ++dataVersionRef.current;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { router.replace('/login'); return; }

      // Parallel fetch for initial user and project list data
      const [memberRes, slotsRes] = await Promise.all([
        supabase.from('members').select('user_id, full_name, role, expired_at, is_paid').eq('user_id', user.id).maybeSingle(),
        supabase.from('project_members').select('project_id, slot_role').eq('user_id', user.id)
      ]);

      if (version !== dataVersionRef.current) return;

      const row = memberRes.data;
      let isExp = false;
      let role = row?.role ?? 'normal';
      if (row?.expired_at && new Date(row.expired_at) < new Date()) { isExp = true; }
      setMember(row ? { ...row, role, isExpired: isExp, approval_status: 'approved' } : { user_id: user.id, role: 'normal', isExpired: false, approval_status: 'pending' });

      const userMemberSlots = slotsRes.data;
      const accessibleProjIds = (userMemberSlots || []).map(m => m.project_id);
      const roleMap = {};
      (userMemberSlots || []).forEach(m => {
        roleMap[m.project_id] = m.slot_role?.startsWith('pembuat') ? 'pembuat' : m.slot_role;
      });
      setAllRoles(roleMap);

      const { data: proj } = await supabase.from('projects')
        .select('*, ahsp_lines(jumlah)')
        .or(`created_by.eq.${user.id},id.in.(${accessibleProjIds.length > 0 ? accessibleProjIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
        .order('updated_at', { ascending: false });

      if (version !== dataVersionRef.current) return;

      setProjects(proj || []);
      if (proj && proj.length > 0 && !isCreating) {
        // Biarkan Unified URL & State Synchronization yang menangani seleksi proyek
        // loadData hanya bertugas memperbarui list proyek
      }
    } finally {
      isCheckingAuth.current = false;
      if (version === dataVersionRef.current) {
        setLoading(false);
      }
    }
  }, [router, isCreating]);

  const handleNewProject = useCallback(() => {
    if (ownedLimitReached) {
      const limitInfo = member?.role === 'advance' ? 5 : (member?.role === 'pro' ? 3 : 1);
      toast.warning(`Batas maksimal ${limitInfo} proyek tercapai. Silakan upgrade atau hapus proyek lama.`);
      return;
    }
    setCreateForm({
      name: '',
      code: '',
      program_name: '',
      activity_name: '',
      work_name: '',
      location: '',
      location_id: member?.selected_location_id || '',
      fiscal_year: new Date().getFullYear().toString(),
      contract_number: '',
      hsp_value: 0,
      ppn_percent: 12
    });
    setIsCreateModalOpen(true);
  }, [ownedLimitReached, member?.role, member?.selected_location_id]);

  // Initial Load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load available locations
  useEffect(() => {
    async function fetchLocations() {
      const { data } = await supabase.from('locations').select('*').order('name');
      if (data) setLocations(data);
    }
    fetchLocations();
  }, []);

  // Efek untuk menangani aksi dari URL (contoh: ?action=new)
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'new' && !loading) {
      handleNewProject();
      // Bersihkan param agar tidak trigger ulang jika page refresh/navigate
      router.replace('/dashboard/rekap-proyek');
    }
  }, [searchParams, loading, handleNewProject, router]);


  // Auto-sync location context for regional pricing
  useEffect(() => {
    if (selectedProject && member?.user_id) {
      const proj = projects.find(p => p.id === selectedProject);
      if (proj?.location_id) {
        supabase.from('members')
          .update({ selected_location_id: proj.location_id })
          .eq('user_id', member.user_id)
          .then(({ error }) => {
            if (error) console.error('Failed to sync location context:', error);
          });
      }
    }
  }, [selectedProject, projects, member?.user_id]);

  const loadTabData = useCallback(async (tab, projectId, babFilter = 'all') => {
    if (!projectId) {
      setTabData({ ahsp: [], harga: [], tkdn: null, dok: [], schedule: { lines: [], resources: [] }, cco: [], mc: [] });
      setTabLoading(false);
      return;
    }
    const version = ++tabVersionRef.current;

    // SWR-style: only show spinner if we have no data yet for this data type
    // This prevents the UI from flickering/blocking when switching between known tabs
    const hasExistingData = (() => {
      switch (tab) {
        case 'proyek': case 'progress': case 'schedule': return tabData.ahsp?.length > 0;
        case 'terpakai': return tabData.harga?.length > 0;
        case 'perubahan': return tabData.cco?.length > 0 || tabData.mc?.length > 0;
        case 'tkdn': return tabData.tkdn !== null;
        case 'dok': return tabData.dok?.length > 0;
        case 'backup': return tabData.backup?.length > 0 || tabData.ahsp?.length > 0;
        default: return false;
      }
    })();

    if (!hasExistingData) {
      setTabLoading(true);
    }

    try {
      if (tab === 'proyek' || tab === 'progress' || tab === 'schedule') {
        const [effectiveRes, linesRes, backupRes, resourcesRes] = await Promise.all([
          supabase.rpc('get_effective_project_budget', { p_project_id: projectId }),
          supabase.from('ahsp_lines').select('*, master_ahsp(kode_ahsp)').eq('project_id', projectId).order('bab_pekerjaan'),
          supabase.from('project_backup_volume').select('*').eq('project_id', projectId),
          supabase.rpc('get_project_resource_aggregation', { p_project_id: projectId })
        ]);

        if (version !== tabVersionRef.current) return;

        const effectiveItems = effectiveRes.data;
        const lines = linesRes.data;
        const backup = backupRes.data;
        const resources = resourcesRes.data;

        const processedLines = (lines || []).map(l => {
          const eff = (effectiveItems || []).find(e => e.line_id === l.id);
          return {
            ...l,
            volume: eff ? parseFloat(eff.volume) : l.volume,
            harga_satuan: eff ? parseFloat(eff.harga_satuan) : l.harga_satuan,
            jumlah: eff ? parseFloat(eff.jumlah) : l.jumlah,
          };
        });

        const firstEff = effectiveItems?.find(e => e.is_cco);
        if (firstEff) {
          const totalCco = effectiveItems.reduce((s, x) => s + (parseFloat(x.jumlah) || 0), 0);
          setActiveCcoVersion({ type: firstEff.cco_version, total: totalCco });
        } else {
          setActiveCcoVersion(null);
        }

        setTabData(prev => ({
          ...prev,
          schedule: { lines: processedLines, resources: resources || [] },
          ahsp: processedLines,
          backup: backup || []
        }));

        const catalog = {};
        const uniqueMasterIds = [...new Set((lines || []).map(l => l.master_ahsp_id).filter(Boolean))];

        if (uniqueMasterIds.length > 0) {
          const { data: catalogData } = await supabase.from('view_katalog_ahsp_lengkap').select('master_ahsp_id, details').in('master_ahsp_id', uniqueMasterIds);
          (catalogData || []).forEach(item => { catalog[item.master_ahsp_id] = item.details || []; });
        }
        setAhspCatalog(catalog);
      }
      else if (tab === 'ahsp') {
        const { data } = await supabase.from('ahsp_lines').select('*, master_ahsp(*)').eq('project_id', projectId).order('bab_pekerjaan');
        if (version !== tabVersionRef.current) return;
        setTabData(prev => ({ ...prev, ahsp: data || [] }));
      }
      else if (tab === 'terpakai') {
        const [ahspRes, resourceSumRes] = await Promise.all([
          supabase.from('ahsp_lines').select('*, master_ahsp(*)').eq('project_id', projectId).order('bab_pekerjaan'),
          supabase.from('view_project_resource_summary').select('*').eq('project_id', projectId)
        ]);

        if (version !== tabVersionRef.current) return;

        const ahsp = ahspRes.data;
        const resourceSum = resourceSumRes.data;
        const aggregated = {};
        (resourceSum || []).forEach(r => {
          const k = r.key_item;
          if (!aggregated[k]) aggregated[k] = { ...r };
          else {
            aggregated[k].total_volume_terpakai = (parseFloat(aggregated[k].total_volume_terpakai) || 0) + (parseFloat(r.total_volume_terpakai) || 0);
            aggregated[k].kontribusi_nilai = (parseFloat(aggregated[k].kontribusi_nilai) || 0) + (parseFloat(r.kontribusi_nilai) || 0);
            aggregated[k].nilai_tkdn = (parseFloat(aggregated[k].nilai_tkdn) || 0) + (parseFloat(r.nilai_tkdn) || 0);
          }
        });

        const priorityMap = { upah: 1, bahan: 2, alat: 3 };
        setTabData(prev => ({
          ...prev,
          ahsp: ahsp || [],
          harga: Object.values(aggregated).sort((a, b) => {
            const pa = priorityMap[a.jenis_komponen?.toLowerCase()] || 99;
            const pb = priorityMap[b.jenis_komponen?.toLowerCase()] || 99;
            if (pa !== pb) return pa - pb;
            return (a.uraian || '').localeCompare(b.uraian || '');
          })
        }));
      }
      else if (tab === 'perubahan') {
        const [ccoRes, mcRes] = await Promise.all([
          supabase.from('project_cco').select('*').eq('project_id', projectId).order('revision_number'),
          supabase.from('project_mc').select('*').eq('project_id', projectId).order('mc_number')
        ]);
        if (version !== tabVersionRef.current) return;
        setTabData(prev => ({ ...prev, cco: ccoRes.data || [], mc: mcRes.data || [] }));
      }
      else if (tab === 'tkdn') {
        const { data: resSum } = await supabase.from('view_project_resource_summary').select('*').eq('project_id', projectId);
        if (version !== tabVersionRef.current) return;

        let total_nilai = 0, total_tkdn_nilai = 0;
        const byJenis = { upah: { nilai: 0, tkdn: 0 }, bahan: { nilai: 0, tkdn: 0 }, alat: { nilai: 0, tkdn: 0 } };
        const list = (resSum || []).map(r => {
          const v_nilai = parseFloat(r.kontribusi_nilai) || 0;
          const v_tkdn_v = parseFloat(r.nilai_tkdn) || 0;
          const j = (r.jenis_komponen || r.jenis || '').toLowerCase();
          total_nilai += v_nilai; total_tkdn_nilai += v_tkdn_v;
          if (byJenis[j]) { byJenis[j].nilai += v_nilai; byJenis[j].tkdn += v_tkdn_v; }
          return { ...r, total_nilai: v_nilai, total_tkdn_nilai: v_tkdn_v, tkdn: parseFloat(r.tkdn_pct || r.tkdn || 0) };
        });
        const total_tkdn_pct = total_nilai > 0 ? (total_tkdn_nilai / total_nilai) * 100 : 0;
        setTabData(prev => ({ ...prev, harga: list, tkdn: { total_nilai, total_tkdn_nilai, total_tkdn_pct, byJenis } }));
      }
      else if (tab === 'backup') {
        const [ahspRes, backupRes] = await Promise.all([
          supabase.from('ahsp_lines').select('*, master_ahsp(*)').eq('project_id', projectId).order('bab_pekerjaan'),
          supabase.from('project_backup_volume').select('*').eq('project_id', projectId)
        ]);
        if (version !== tabVersionRef.current) return;
        setTabData(prev => ({ ...prev, ahsp: ahspRes.data || [], backup: backupRes.data || [] }));
      }
    } finally {
      if (version === tabVersionRef.current) setTabLoading(false);
    }
  }, [tabData.ahsp?.length, tabData.backup?.length, tabData.cco?.length, tabData.dok?.length, tabData.harga?.length, tabData.mc?.length, tabData.tkdn]);

  useEffect(() => {
    if (!selectedProject || activeTab === 'daftar') return;
    loadTabData(activeTab, selectedProject, selectedBab);
  }, [selectedProject, activeTab, selectedBab, subTabProyek, perubahanSubTab, terpakaiSubTab, loadTabData]);

  async function updateProjectStartDate(val) {
    if (!selectedProject) return;
    setProjectStartDate(val);
    await supabase.from('projects').update({ start_date: val }).eq('id', selectedProject);
  }

  async function saveStartDate(lineId, date) {
    setStartDates(prev => ({ ...prev, [lineId]: date }));
    await supabase.from('ahsp_lines').update({ start_date: date }).eq('id', lineId);
  }

  async function saveItemWorkers(lineId, value) {
    const val = parseInt(value) || null;
    setSavingField(`${lineId}:workers`);
    setItemWorkers(prev => ({ ...prev, [lineId]: val }));
    setTabData(prev => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        lines: prev.schedule.lines.map(l => l.id === lineId ? { ...l, pekerja_input: val } : l),
      },
    }));
    await supabase.from('ahsp_lines').update({ pekerja_input: val }).eq('id', lineId);
    setSavingField(null);
  }

  async function saveItemDurasi(lineId, value) {
    const val = parseInt(value) || null;
    setSavingField(`${lineId}:durasi`);
    setItemDurasi(prev => ({ ...prev, [lineId]: val }));
    setTabData(prev => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        lines: prev.schedule.lines.map(l => l.id === lineId ? { ...l, durasi_input: val } : l),
      },
    }));
    await supabase.from('ahsp_lines').update({ durasi_input: val }).eq('id', lineId);
    setSavingField(null);
  }

  const manpowerItems = useMemo(() => {
    try {
      const { lines } = tabData.schedule;
      if (!lines?.length || !ahspCatalog) return [];
      const laborSettings = currentProjectObj?.labor_settings || {};
      const itemWorkers = currentProjectObj?.item_workers || {};
      const itemDurasi = currentProjectObj?.item_durasi || {};
      return computeManpower(lines, ahspCatalog, laborSettings, itemWorkers, itemDurasi) || [];
    } catch (e) {
      console.error('Manpower compute error:', e);
      return [];
    }
  }, [tabData.schedule, ahspCatalog, currentProjectObj]);

  const globalLaborRoles = useMemo(() => {
    const roles = new Set();
    const detectLabor = (d) => {
      const type = (d.jenis_komponen || d.jenis || '').toLowerCase();
      const kode = (d.kode_item || d.kode || '').toUpperCase();
      const uraian = (d.uraian || '').toLowerCase();

      // Prioritas 1: Kode Item dimulai dengan L.
      if (kode.startsWith('L.')) return true;

      // Prioritas 2: Tipe eksplisit
      const isExplicitLabor = type === 'upah' || type === 'labor' || type === 'tenaga' || type === 'pekerja';
      if (isExplicitLabor) return true;

      // Fallback Keyword (lebih ketat)
      return (
        uraian === 'pekerja' || uraian === 'tukang' || uraian === 'mandor' ||
        uraian === 'kepala tukang' || uraian.includes('tenaga kerja')
      );
    };

    Object.values(ahspCatalog).forEach(details => {
      details.filter(detectLabor).forEach(d => roles.add(d.uraian));
    });

    const lines = tabData.schedule.lines || [];
    lines.forEach(line => {
      const details = line.analisa_custom || [];
      details.filter(detectLabor).forEach(d => roles.add(d.uraian));
    });

    return Array.from(roles).sort();
  }, [tabData.schedule.lines, ahspCatalog]);

  async function handleJoinProject() {
    if (!joinCode) return;
    setJoining(true);
    setModalStatus(null);
    try {
      const { data: p, error: pErr } = await supabase
        .from('projects')
        .select('id, name')
        .eq('unique_code', joinCode.toUpperCase())
        .maybeSingle();

      if (pErr) throw pErr;
      if (!p) {
        setModalStatus({ type: 'error', msg: 'Kode proyek tidak valid.' });
        return;
      }

      const { data: existing } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', p.id)
        .eq('user_id', member.user_id)
        .maybeSingle();

      if (existing) {
        setModalStatus({ type: 'error', msg: 'Anda sudah tergabung dalam proyek ini.' });
        return;
      }

      const { count } = await supabase
        .from('project_members')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', p.id);

      if (count >= 3) {
        setModalStatus({ type: 'error', msg: 'Proyek ini sudah penuh (Batas 3 User).' });
        return;
      }

      const { error: insErr } = await supabase
        .from('project_members')
        .insert({
          project_id: p.id,
          user_id: member.user_id,
          role: 'view'
        });

      if (insErr) throw insErr;

      setModalStatus({ type: 'success', msg: `Berhasil bergabung ke ${p.name}` });
      setJoinCode('');
      setTimeout(() => setShowJoinModal(false), 2000);
      loadData();
    } catch (err) {
      setModalStatus({ type: 'error', msg: err.message });
    } finally {
      setJoining(false);
    }
  }

  const sequencedSchedule = useMemo(() => {
    return getSequencedSchedule(manpowerItems, projectStartDate, startDates);
  }, [manpowerItems, projectStartDate, startDates]);

  const manpowerSummary = useMemo(() => {
    const total = manpowerItems.length;
    const withDurasi = manpowerItems.filter(r => r.durasi_hari !== null);
    const maxDurasi = withDurasi.reduce((m, r) => Math.max(m, r.durasi_hari), 0);
    const totalUpah = manpowerItems.reduce((s, r) => s + r.total_upah, 0);
    const totalWorkers = manpowerItems.reduce((s, r) => s + r.pekerja, 0);
    let projectTotalDays = 0;
    if (sequencedSchedule.length > 0) {
      const starts = sequencedSchedule.map(r => r.seq_start).filter(Boolean);
      const ends = sequencedSchedule.map(r => r.seq_end).filter(Boolean);
      if (starts.length && ends.length) {
        const minStart = new Date(Math.min(...starts.map(s => new Date(s))));
        const maxEnd = new Date(Math.max(...ends.map(e => new Date(e))));
        projectTotalDays = Math.ceil((maxEnd - minStart) / 86400000) + 1;
      }
    }
    return { total, maxDurasi, totalUpah, totalWorkers, projectTotalDays };
  }, [manpowerItems, sequencedSchedule]);

  const scheduleGanttData = useMemo(() => {
    const base = projectStartDate ? new Date(projectStartDate) : null;
    return sequencedSchedule.filter(r => r.durasi_hari !== null && r.durasi_hari <= scheduleRange).map((r, idx) => {
      const offset = (base && r.seq_start) ? Math.max(0, Math.round((new Date(r.seq_start) - base) / 86400000)) : 0;
      return {
        name: r.uraian?.length > 18 ? r.uraian.slice(0, 18) + '…' : (r.uraian || '—'),
        fullName: r.uraian || '—',
        offset, durasi: r.durasi_hari, seq_start: r.seq_start, seq_end: r.seq_end, bab: r.bab, pekerja: r.pekerja, idx,
      };
    }).reverse();
  }, [sequencedSchedule, scheduleRange, projectStartDate]);

  const babOptions = useMemo(() => {
    const babs = tabData.schedule.lines.map(l => l.bab_pekerjaan).filter(Boolean);
    return [...new Set(babs)];
  }, [tabData.schedule.lines]);


  async function handleAssignSlot(projectId, userId, slotRole) {
    if (!userId) return;
    setAssigning(true);
    setModalStatus(null);
    try {
      const { data, error } = await supabase.rpc('assign_project_slot', {
        p_project_id: projectId,
        p_user_id: userId,
        p_slot_role: slotRole
      });
      if (error) throw error;
      if (data.error) {
        setModalStatus({ type: 'error', msg: data.error });
      } else {
        await fetchMembersForProject(projectId);
        setModalStatus({ type: 'success', msg: 'Peran berhasil ditetapkan.' });
        setTimeout(() => setModalStatus(null), 2000);
        loadData();
      }
    } catch (err) {
      setModalStatus({ type: 'error', msg: err.message });
    } finally {
      setAssigning(false);
    }
  }

  async function handleResetSlot(projectId, slotRole) {
    setModalStatus(null);
    try {
      const { data, error } = await supabase.rpc('reset_project_slot', { p_project_id: projectId, p_slot_role: slotRole });
      if (error) throw error;
      if (data.error) {
        setModalStatus({ type: 'error', msg: data.error });
      } else {
        await fetchMembersForProject(projectId);
        setModalStatus({ type: 'success', msg: 'Slot direset.' });
        setTimeout(() => setModalStatus(null), 2000);
        loadData();
      }
    } catch (err) {
      setModalStatus({ type: 'error', msg: err.message });
    }
  }

  async function handleRemoveMember(projectId, userId) {
    setModalStatus(null);
    try {
      const { data, error } = await supabase.rpc('remove_project_member', { p_project_id: projectId, p_user_id: userId });
      if (error) throw error;
      if (data.error) {
        setModalStatus({ type: 'error', msg: data.error });
      } else {
        await fetchMembersForProject(projectId);
        setModalStatus({ type: 'success', msg: 'Member berhasil dikeluarkan dari proyek.' });
        setTimeout(() => setModalStatus(null), 2000);
        loadData();
      }
    } catch (err) {
      setModalStatus({ type: 'error', msg: err.message });
    }
  }



  const handleDeleteProject = async (id) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('projects').delete().eq('id', confirmDeleteId);
      if (error) throw error;
      setProjects(prev => prev.filter(p => p.id !== confirmDeleteId));
      if (selectedProject === confirmDeleteId) setSelectedProject(null);
      setModalStatus({ type: 'success', msg: 'Seluruh struktur data Proyek, CCO, MC, dan Dokumentasi telah dihapus permanen dari sistem.' });
    } catch (err) {
      setModalStatus({ type: 'error', msg: err.message });
    } finally {
      setConfirmDeleteId(null);
      setLoading(false);
    }
  };

  async function handleUpdateLineStatus(lineId, newStatus) {
    let rpcName = '';
    if (newStatus === 'verified') rpcName = 'set_line_verified';
    else if (newStatus === 'draft') rpcName = 'set_line_draft';
    else if (newStatus === 'final') rpcName = 'set_line_final';
    if (!rpcName) return;
    setTabLoading(true);
    try {
      const { data, error } = await supabase.rpc(rpcName, { p_line_id: lineId });
      if (error) throw error;
      if (data.error) toast.error(data.error);
      else {
        toast.success('Status item berhasil diperbarui.');
        setTabData(prev => ({
          ...prev,
          ahsp: prev.ahsp.map(l => l.id === lineId ? { ...l, status_approval: newStatus } : l),
          schedule: {
            ...prev.schedule,
            lines: prev.schedule.lines.map(l => l.id === lineId ? { ...l, status_approval: newStatus } : l)
          }
        }));
      }
    } catch (err) { toast.error('Gagal update status: ' + err.message); } finally { setTabLoading(false); }
  }

  async function handleLeaveProject(projectId) {
    const confirmed = await toast.confirm(
      'Keluar dari proyek ini?',
      'Anda tidak akan bisa mengakses proyek ini sampai diundang kembali.'
    );
    if (!confirmed) return;
    setTabLoading(true);
    try {
      const { data, error } = await supabase.rpc('leave_project', { p_project_id: projectId });
      if (error) throw error;
      toast.success('Berhasil keluar dari proyek.');
      loadData();
    } catch (err) {
      toast.error('Gagal keluar: ' + err.message);
    } finally {
      setTabLoading(false);
    }
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0f172a]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-orange-500" />
    </div>
  );

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-[#0f172a] role-${userSlotRole}`}>
      <div className="sticky top-0 z-[80] bg-slate-50/80 backdrop-blur-md dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-6 py-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="hidden lg:flex text-xl font-bold text-slate-900 dark:text-slate-100 items-center gap-2">
              <Package className="w-6 h-6 text-indigo-600 dark:text-orange-500" /> Proyek
            </h1>

            {/* ── Deretan Ikon Navigasi Tab ── */}
            <div className="flex items-center gap-1.5 ml-0 lg:ml-4 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto flex-1 lg:flex-initial no-scrollbar">
              {visibleTabs.map(tab => (
                <div key={tab.id} className="relative group flex-shrink-0">
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`p-2 rounded-xl transition-all duration-300 ${activeTab === tab.id
                      ? 'bg-indigo-600 dark:bg-orange-600 text-white shadow-lg scale-105'
                      : 'text-slate-400 hover:text-indigo-600 dark:hover:text-orange-400'
                      }`}
                  >
                    <tab.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              ))}
            </div>

            {/* ── Grup Filter (Aktivitas & Bab) Terintegrasi ke Header ── */}
            <div className="hidden lg:flex items-center gap-3 ml-4 pl-4 border-l border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 bg-slate-100/30 dark:bg-slate-800/20 px-3 py-1.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <select value={selectedProject || ''} onChange={e => setSelectedProject(e.target.value)} className="text-[10px] font-black bg-transparent border-0 text-slate-600 dark:text-slate-300 p-0 cursor-pointer focus:ring-0 max-w-[150px] truncate">
                  {isCreating && !selectedProject && (
                    <option value="" className="dark:bg-slate-800 dark:text-orange-400 font-bold">
                      PROYEK BARU: {identityForm.name || 'DRAFT'}
                    </option>
                  )}
                  {!selectedProject && !isCreating && <option value="" disabled>Pilih Proyek...</option>}
                  {projects.map(p => <option key={p.id} value={p.id} className="dark:bg-slate-800 dark:text-white">{p.name || p.activity_name || 'Proyek'}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-slate-100/30 dark:bg-slate-800/20 px-3 py-1.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                <select value={selectedBab} onChange={e => setSelectedBab(e.target.value)} className="text-[10px] font-black bg-transparent border-0 text-slate-600 dark:text-slate-300 p-0 cursor-pointer focus:ring-0 max-w-[120px] truncate">
                  <option value="all" className="dark:bg-slate-800 dark:text-white">Semua Bab</option>
                  {babOptions.map(bab => <option key={bab} value={bab} className="dark:bg-slate-800 dark:text-white">{bab}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">

            <button
              onClick={handleNewProject}
              disabled={ownedLimitReached}
              className={`text-xs border px-4 py-2 rounded-xl font-bold transition-all shadow-sm flex items-center gap-2 ${ownedLimitReached
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none'
                  : 'border-indigo-100 dark:border-slate-700 bg-indigo-600 dark:bg-orange-600 text-white hover:scale-105 active:scale-95'
                }`}
            >
              <Plus className="w-4 h-4" /> Proyek Baru {ownedLimitReached && <span className="text-[8px] opacity-70">({isModeNormal ? 'BATAS 1 TERCAPAI' : 'BATAS 3 TERCAPAI'})</span>}
            </button>

            {/* Gabung Proyek: Pro=join only, Advance/Admin=full join */}
            {!isModeNormal && (
              <button
                onClick={() => !joinedLimitReached && setShowJoinModal(true)}
                disabled={joinedLimitReached}
                className={`text-xs border px-4 py-2 rounded-xl font-bold transition-all shadow-sm flex items-center gap-2 ${joinedLimitReached
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none'
                    : 'border-indigo-100 dark:border-slate-700 bg-indigo-50/50 dark:bg-slate-800 text-indigo-700 dark:text-orange-400 hover:bg-white'
                  }`}
              >
                <Users className="w-4 h-4" /> Gabung Proyek {joinedLimitReached && <span className="text-[8px] opacity-70">(BATAS 7 TERCAPAI)</span>}
              </button>
            )}

          </div>
        </div>
      </div>

      {activeTab !== 'daftar' && (currentProjectObj || isCreating) && (
        <div className="sticky top-[73px] z-[70] bg-white/90 dark:bg-slate-900/95 backdrop-blur-md border-b-2 border-indigo-600/20 dark:border-orange-500/30 px-4 md:px-6 py-1.5 flex flex-nowrap lg:flex-wrap items-center justify-between gap-2 md:gap-4 shadow-sm overflow-x-hidden">
          <div className="flex items-center gap-2">
          <div className="flex items-center justify-between w-full lg:w-auto">
            <div className="hidden lg:flex items-center gap-0 overflow-hidden rounded-xl shadow-lg border border-indigo-500/30 dark:border-orange-500/20">
              <div className="bg-[#0f172a] dark:bg-slate-800 px-3 py-1.5 flex flex-col items-center justify-center border-r border-indigo-500/20">
                <span className="text-[6px] font-black text-white/50 uppercase tracking-[0.2em] leading-none mb-0.5">Tab</span>
                <span className="text-[8px] font-black text-indigo-400 dark:text-orange-400 uppercase tracking-widest leading-none">Proyek</span>
              </div>
              <div className="bg-indigo-600 dark:bg-orange-600 px-4 py-1.5 flex items-center min-w-[100px] justify-center">
                <span className="text-[10px] font-black text-white uppercase tracking-widest drop-shadow-sm">{activeTabObj?.label}</span>
              </div>
            </div>

            {/* Mobile Tab Icon (Right Side) */}
            <div className="lg:hidden flex items-center gap-2 ml-auto">
               <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-orange-600 flex items-center justify-center text-white shadow-md">
                 {activeTabObj && <activeTabObj.icon className="w-4 h-4" />}
               </div>
            </div>
          </div>

            {/* Desktop Only Labels/Toggles */}
            <div className="flex items-center gap-2">
              {activeTab === 'proyek' && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl ml-4 border border-slate-200 dark:border-slate-700">
                {((isAdmin || isOwner || userSlotRole === 'pembuat') && !isModeNormal) && (
                  <button
                    onClick={() => setSubTabProyek('rab')}
                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${subTabProyek === 'rab' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    RAB Pekerjaan
                  </button>
                )}
                {isModeNormal && (
                  <div className="px-3 py-1 bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                    RAB Pekerjaan
                  </div>
                )}
                {!isModeNormal && (
                  <>
                    <button
                      onClick={() => setSubTabProyek('backup')}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${subTabProyek === 'backup' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Backup Data
                    </button>
                    <button
                      onClick={() => setSubTabProyek('schedule')}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${subTabProyek === 'schedule' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Jadwal (Schedule)
                    </button>
                  </>
                )}
              </div>
            )}

            {activeTab === 'progress' && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl ml-4 border border-slate-200 dark:border-slate-700">
                {[
                  { id: 'volume', icon: TrendingUp, label: 'Progress Volume' },
                  { id: 'material', icon: Package, label: 'Material' },
                  { id: 'labor', icon: Users, label: 'Tenaga Kerja' }
                ].map(btn => (
                  <button
                    key={btn.id}
                    onClick={() => setProgressViewMode(btn.id)}
                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${progressViewMode === btn.id ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'terpakai' && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl ml-4 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setTerpakaiSubTab('ahsp')}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${terpakaiSubTab === 'ahsp' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  AHSP Terpakai
                </button>
                <button
                  onClick={() => setTerpakaiSubTab('harga')}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${terpakaiSubTab === 'harga' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Komponen Harga
                </button>
              </div>
            )}

            {activeTab === 'perubahan' && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl ml-4 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setPerubahanSubTab('cco')}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${perubahanSubTab === 'cco' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Change Order (CCO)
                </button>
                <button
                  onClick={() => setPerubahanSubTab('mc')}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${perubahanSubTab === 'mc' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-orange-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Mutual Check (MC)
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
            {activeTab === 'proyek' && currentProjectObj && (
              <div className="hidden sm:flex items-center gap-4 pr-4 border-r border-slate-200 dark:border-slate-800">
                <div className="flex flex-col items-end">
                  <span className="text-[7px] font-black text-indigo-500 uppercase tracking-widest leading-none mb-1">Nama Proyek</span>
                  <span className="text-[10px] font-black text-slate-800 dark:text-white truncate max-w-[80px] sm:max-w-[120px]">{currentProjectObj.name}</span>
                </div>
                <div className="hidden lg:flex flex-col items-end">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pagu Proyek</span>
                  <span className="text-[10px] font-mono font-black text-slate-700 dark:text-slate-300">{formatIdr(currentProjectObj.hsp_value)}</span>
                </div>
                <div className="hidden lg:flex flex-col items-end">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Selisih</span>
                  <span className={`text-[10px] font-mono font-black ${currentProjectObj.hsp_value >= projectMetrics.total ? 'text-emerald-500' : 'text-red-500'}`}>
                    {formatIdr(currentProjectObj.hsp_value - projectMetrics.total)}
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-col items-end">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                {projectMetrics.isCco ? `Total Kontrak (${projectMetrics.version})` : 'Total Kontrak'}
              </span>
              <span className="text-[10px] font-mono font-black text-indigo-600 dark:text-orange-500">{formatIdr(projectMetrics.total)}</span>
            </div>
            <div className="flex flex-col items-end pl-4 border-l border-slate-200 dark:border-slate-800">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Durasi</span>
              <span className="text-[10px] font-black text-slate-900 dark:text-white">{projectMetrics.duration || manpowerSummary.projectTotalDays || 0} <span className="text-[8px] text-slate-400">Hari</span></span>
            </div>

            <button
              onClick={() => setIsIdentityModalOpen(true)}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 dark:hover:bg-orange-600 text-slate-600 dark:text-slate-300 hover:text-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:scale-105 active:scale-95 group ml-1 md:ml-2"
            >
              <Settings2 className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
              <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Info Proyek</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Area Border Kerja ── */}
      <div className="px-6 pb-20 pt-0 transition-all duration-500">
        <div className="rounded-b-[32px] border-x-2 border-b-2 border-indigo-600/10 dark:border-orange-500/20 bg-white dark:bg-[#0f172a] shadow-2xl p-0 ring-1 ring-slate-200 dark:ring-slate-800 min-h-[60vh] overflow-hidden">
          {activeTab === 'daftar' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-[#1e293b] shadow-xl">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                <thead className="bg-indigo-50/80 dark:bg-orange-600/10 text-[10px] uppercase tracking-widest text-indigo-600 dark:text-orange-400 font-black border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-8 py-5 text-left w-1/3">PROYEK</th>
                    <th className="px-6 py-5 text-center w-24">ROLE</th>
                    <th className="px-6 py-5 text-center">TOTAL KONTRAK</th>
                    <th className="px-6 py-5 text-center">DURASI / REALISASI</th>
                    <th className="px-6 py-5 text-center">KODE BERBAGI</th>
                    <th className="px-8 py-5 text-right">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-24 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-40">
                          <Package className="w-16 h-16 text-slate-300" />
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-black text-slate-500 uppercase tracking-[0.2em]">Belum Ada Proyek</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Silakan buat proyek baru atau gabung proyek rekan Anda</p>
                          </div>
                          {(member?.role === 'admin' || member?.role === 'pro' || member?.role === 'normal') && (
                            <button
                              onClick={handleNewProject}
                              disabled={ownedLimitReached}
                              className={`mt-4 px-6 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all ${ownedLimitReached
                                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                                  : 'bg-indigo-600 dark:bg-orange-600 text-white shadow-xl hover:scale-105 active:scale-95'
                                }`}
                            >
                              {ownedLimitReached ? (isModeNormal ? 'Batas 1 Proyek (Trial) Tercapai' : 'Batas 3 Proyek Tercapai') : '+ Buat Proyek Pertama'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    projects.map(p => {
                      if (!p) return null;
                      const slotRole = allRoles[p.id];
                      const myRole = p.created_by === member?.user_id ? 'Owner' : slotRole;

                      // Calculate Total for this project
                      const subtotal = (p.ahsp_lines || []).reduce((sum, line) => sum + (Number(line.jumlah) || 0), 0);
                      const ppn = subtotal * ((p.ppn_percent || 12) / 100);
                      const total = subtotal + ppn;
                      const rounded = Math.ceil((total || 0) / 1000) * 1000;

                      return (
                        <tr key={p.id} className="hover:bg-indigo-50/50 dark:hover:bg-orange-500/10 transition-colors group border-b border-slate-50 dark:border-slate-800 last:border-0">
                          <td className="px-8 py-5 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center text-indigo-600 dark:text-orange-500 shrink-0 shadow-inner">
                              <LayoutGrid className="w-5 h-5" />
                            </div>
                            <div className="truncate">{p.name || p.activity_name || 'Tanpa Nama'}</div>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${myRole === 'Owner'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : (myRole ? 'bg-indigo-50 text-indigo-700 dark:bg-orange-500/10 dark:text-orange-400 border border-indigo-100 dark:border-orange-500/20' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700')
                              }`}>
                              {myRole || 'Pending'}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-center font-mono font-black text-slate-900 dark:text-white">
                            {formatIdr(rounded)}
                          </td>
                          <td className="px-6 py-5 text-center">
                            {p.manual_duration > 0 ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-black text-sm text-slate-800 dark:text-white">
                                  {p.manual_duration} / {p.start_date ? Math.max(0, Math.floor((new Date() - new Date(p.start_date)) / 86400000) + 1) : 0}
                                  <span className="text-[10px] font-semibold text-slate-400 ml-1">hari</span>
                                </span>
                                {p.start_date ? (
                                  <span className="text-[9px] text-slate-400 font-mono">
                                    {safeFormatDate(p.start_date)}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-amber-500 font-semibold">Tgl mulai belum diset</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[9px] text-slate-400 italic">— Belum diset —</span>
                            )}
                          </td>
                          <td className="px-6 py-5 text-center">
                            {p.created_by === member?.user_id ?
                              (member?.role === 'admin' || member?.role === 'advance' ? (
                                <button onClick={() => setShowShareModal(p)} className="px-4 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-black tracking-widest border border-emerald-100 dark:border-emerald-800/50 hover:bg-emerald-100 transition-all uppercase flex items-center gap-2 mx-auto">
                                  {p.unique_code} <Zap className="w-3 h-3 text-emerald-500 fill-emerald-500 animate-pulse" />
                                </button>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600 text-[10px] uppercase font-bold tracking-widest italic text-center block">Hanya Advance</span>
                              ))
                              : <span className="text-slate-400 dark:text-slate-600 text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-2 italic">🔒 Terproteksi</span>
                            }
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex justify-end items-center gap-3">
                              <button
                                onClick={() => { setSelectedProject(p.id); setActiveTab('proyek'); }}
                                className="px-4 py-2 bg-indigo-600 dark:bg-orange-600 text-white text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:scale-[1.05] active:scale-95 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                              >
                                Buka
                              </button>
                              {p.created_by === member?.user_id ? (
                                <button
                                  onClick={() => handleDeleteProject(p.id)}
                                  className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all active:scale-90"
                                  title="Hapus Proyek"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleLeaveProject(p.id)}
                                  className="p-2.5 text-slate-300 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-2xl transition-all"
                                  title="Keluar dari Proyek"
                                >
                                  <LogOut className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'proyek' && (
            <div className="space-y-6">
              {(!selectedProject && !isCreating) ? (
                <div className="bg-white/50 dark:bg-slate-900/50 rounded-3xl p-20 border-2 border-dashed border-slate-200 dark:border-slate-800 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <LayoutGrid className="w-8 h-8 text-slate-400" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">Belum Ada Proyek Terpilih</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Silakan pilih proyek di tab <span className="text-indigo-600 dark:text-orange-500">Daftar Proyek</span> untuk melihat RAB dan Jadwal</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <button onClick={() => setActiveTab('daftar')} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-white transition-all">
                      Kembali Ke Daftar
                    </button>
                    {(member?.role === 'admin' || member?.role === 'pro' || member?.role === 'normal') && (
                      <button
                        onClick={handleNewProject}
                        disabled={ownedLimitReached}
                        className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all ${ownedLimitReached
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                            : 'bg-indigo-600 dark:bg-orange-600 text-white shadow-xl hover:scale-105 active:scale-95'
                          }`}
                      >
                        {ownedLimitReached ? 'Batas 3 Proyek Tercapai' : '+ Buat Proyek Baru'}
                      </button>
                    )}
                  </div>
                </div>
              ) : subTabProyek === 'rab' ? (
                <RabEditorTab
                  projectId={selectedProject}
                  initialIdentity={isCreating && !selectedProject ? createForm : currentProjectObj}
                  backupData={tabData.backup}
                  member={member}
                  onTotalChange={setLocalTotalKontrak}
                  onRefresh={(newId) => {
                    setIsCreating(false);
                    setLocalTotalKontrak(null); // Reset status lokal setelah berhasil simpan
                    const targetId = newId || selectedProject;
                    if (newId) setSelectedProject(newId);

                    // Force refresh both project overview and current tab details
                    loadData();
                    loadTabData(activeTab, targetId, selectedBab);
                  }}
                  onEditIdentity={() => setIsIdentityModalOpen(true)}
                  ownerId={projectOwnerId || member?.user_id}
                  projectStartDate={projectStartDate}
                  setProjectStartDate={updateProjectStartDate}
                />
              ) : subTabProyek === 'backup' ? (
                <BackupVolumeTab {...{
                  activeTab, tabLoading, tabData, projectId: selectedProject,
                  onRefresh: () => loadTabData(activeTab, selectedProject),
                  userSlotRole, isAdmin, isOwner,
                  memberRole: member?.role,
                  selectedLineId: selectedBackupLineId,
                  onSelectLineId: setSelectedBackupLineId
                }} />
              ) : (
                <ScheduleTab {...{ tabLoading, tabData, manpowerItems, sequencedSchedule, scheduleGanttData, projectStartDate, setProjectStartDate: updateProjectStartDate, scheduleRange, setScheduleRange, manpowerSummary, setShowCalendar, startDates, saveStartDate, selectedBab, globalLaborRoles, laborSettings, setLaborSettings, selectedProject, projects, supabase, saveItemWorkers, saveItemDurasi, savingField, userSlotRole, isAdmin }} />
              )}
            </div>
          )}

          {activeTab === 'progress' && (
            <ProgressTab {...{ projectId: selectedProject, activeTab, tabLoading, items: tabData.schedule.lines, resources: tabData.harga, projectStartDate, userSlotRole, isAdmin, canVerify, canApproveFinal, onUpdateStatus: handleUpdateLineStatus, viewMode: progressViewMode, setViewMode: setProgressViewMode, timeRange: progressTimeRange, setTimeRange: setProgressTimeRange, savingStatus: statusSimpan, setSavingStatus: setStatusSimpan, isOwner, isModeNormal }} />
          )}

          {activeTab === 'ahsp' && (
            <AhspTab {...{ activeTab, tabLoading, tabData, formatIdr, canVerify, canApproveFinal, onUpdateStatus: handleUpdateLineStatus }} />
          )}

          {activeTab === 'terpakai' && <DataTerpakaiTab {...{ activeTab, tabLoading, tabData, formatIdr, onRefresh: () => loadTabData(activeTab, selectedProject), subTab: terpakaiSubTab, setSubTab: setTerpakaiSubTab, resFilter: terpakaiResFilter, setResFilter: setTerpakaiResFilter, readOnly: false }} />}
          {activeTab === 'perubahan' && <DataPerubahanTab {...{ activeTab, tabLoading, tabData, projectId: selectedProject, onRefresh: () => loadTabData(activeTab, selectedProject, selectedBab), userSlotRole, isAdmin: isAdmin || isAdvance || member?.role === 'pro', subTab: perubahanSubTab, setSubTab: setPerubahanSubTab }} />}
          {activeTab === 'tkdn' && <TkdnTab {...{ activeTab, tabLoading, tabData, formatIdr }} />}
          {activeTab === 'dok' && <DokTab {...{ activeTab, tabLoading, tabData, formatIdr }} />}
          {activeTab === 'export' && !!selectedProject && <ExportImportTab tabLoading={tabLoading} ahspLines={tabData.ahsp} project={projects.find(p => p.id === selectedProject)} isModeNormal={isModeNormal} userMember={member} />}
        </div>
      </div>

      {showCalendar && <CalendarModal isOpen={showCalendar} onClose={() => setShowCalendar(false)} items={sequencedSchedule} scheduleRange={scheduleRange} projectStartDate={projectStartDate} />}

      {showJoinModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-md p-8 border border-slate-100 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Gabung Proyek</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Masukkan kode unik proyek</p>
              </div>
              <button onClick={() => setShowJoinModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <Plus className="w-5 h-5 rotate-45 text-slate-400" />
              </button>
            </div>

            <div className="space-y-6">
              <input
                type="text"
                placeholder="KODE PROYEK"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-lg font-black tracking-widest outline-none uppercase text-center"
              />

              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center leading-relaxed">
                  Setelah bergabung, pemilik proyek akan menentukan peran Anda sebagai Kontraktor, Konsultan, atau Instansi.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-2xl text-xs uppercase"
                >
                  Batal
                </button>
                <button
                  onClick={handleJoinProject}
                  disabled={joining || !joinCode}
                  className="flex-[2] py-4 bg-indigo-600 dark:bg-orange-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs disabled:opacity-50 active:scale-95 transition-all"
                >
                  {joining ? 'Memproses...' : 'Gabung'}
                </button>
              </div>

              {modalStatus && (
                <div className={`p-4 rounded-xl text-[10px] font-bold text-center animate-in slide-in-from-top-2 duration-300 ${modalStatus.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  }`}>
                  {modalStatus.msg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 shrink-0">
              <div>
                <h3 className="text-xs font-black text-slate-900 dark:text-white tracking-tight uppercase">Kolaborasi Proyek</h3>
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Manajemen Slot Personil (3-Pihak)</p>
              </div>
              <button
                onClick={() => { setShowShareModal(null); setCopied(false); setModalStatus(null); }}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
                title="Tutup"
              >
                <Plus className="w-4 h-4 rotate-45 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 custom-scrollbar">
              {/* Box Kode Compact */}
              <div className="bg-indigo-600 dark:bg-orange-600 p-3.5 rounded-2xl shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                  <Zap className="w-10 h-10 text-white" />
                </div>
                <div className="relative z-10 flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-[6px] font-black text-white/70 uppercase tracking-[0.2em] mb-0.5">Kode Berbagi</span>
                    <span className="text-lg font-mono font-black text-white tracking-[0.1em]">{showShareModal.unique_code}</span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(showShareModal.unique_code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl transition-all active:scale-90"
                    title="Salin Kode"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-white" />}
                  </button>
                </div>
              </div>

              {/* Status Message Internal */}
              {modalStatus && (
                <div className={`p-3 rounded-xl border text-center animate-in slide-in-from-top-1 duration-200 ${modalStatus.type === 'success'
                    ? 'bg-green-50 border-green-100 text-green-600 dark:bg-green-900/10 dark:border-green-900/30 dark:text-green-400'
                    : 'bg-red-50 border-red-100 text-red-600 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-400'
                  }`}>
                  <p className="text-[9px] font-bold">{modalStatus.msg}</p>
                </div>
              )}

              <div className="space-y-3">
                {['pembuat_1', 'pembuat_2', 'pengecek'].map((slot) => {
                  const holder = projectMembers.find(m => m.slot_role === slot);
                  const isUserSelf = holder?.user_id === member?.user_id;
                  const isOwner = showShareModal.created_by === member?.user_id;
                  const unassignedMembers = projectMembers.filter(m => !m.slot_role);

                  // Label visualisasi untuk masing-masing slot
                  const slotLabel = slot === 'pembuat_1' ? 'Editor 1' : slot === 'pembuat_2' ? 'Editor 2' : 'Pengecek';
                  const slotDesc = slot.startsWith('pembuat') ? 'Bisa Merubah Data' : 'Hanya Ceklist / Read-Only';
                  const slotIconChar = slot === 'pembuat_1' ? 'E1' : slot === 'pembuat_2' ? 'E2' : 'C';

                  return (
                    <div key={slot} className="group relative flex flex-col p-3 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800/50 hover:border-indigo-100 dark:hover:border-orange-500/20 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 w-full">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[9px] uppercase shadow-sm ${holder ? 'bg-indigo-600 dark:bg-orange-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                            }`}>
                            {slotIconChar}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">{slotLabel}</span>
                            <span className="text-[5.5px] font-bold text-slate-300 uppercase tracking-widest leading-none mb-1">{slotDesc}</span>
                            {holder ? (
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[10px] font-bold text-slate-900 dark:text-white truncate">{holder.members?.full_name}</span>
                                  <span className="text-[7.5px] text-slate-400 truncate leading-tight">{holder.members?.email}</span>
                                </div>
                                {(isOwner || isUserSelf) && (
                                  <button
                                    onClick={() => handleResetSlot(showShareModal.id, slot)}
                                    className="p-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 transition-all active:scale-95"
                                    title="Reset"
                                  >
                                    <UserMinus className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-300 italic">Belum Terisi</span>
                                {isOwner && unassignedMembers.length > 0 && (
                                  <select
                                    onChange={(e) => handleAssignSlot(showShareModal.id, e.target.value, slot)}
                                    disabled={assigning}
                                    className="w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[9px] font-bold py-1 px-1.5 outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                  >
                                    <option value="">Pilih Member...</option>
                                    {unassignedMembers.map(m => (
                                      <option key={m.user_id} value={m.user_id}>{m.members?.full_name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Daftar Personil Proyek (Semua Member) */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Users className="w-3 h-3 text-indigo-500 dark:text-orange-500" />
                  <p className="text-[8px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-[0.2em]">Daftar Personil Terdaftar</p>
                </div>
                <div className="space-y-1.5">
                  {projectMembers.length > 0 ? projectMembers.map(m => {
                    const isMembOwner = m.user_id === showShareModal.created_by;
                    return (
                      <div key={m.user_id} className="flex items-center justify-between p-2 bg-white dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800/50">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black ${isMembOwner ? 'bg-indigo-100 dark:bg-orange-500/10 text-indigo-600 dark:text-orange-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}>
                            {m.members?.full_name?.charAt(0) || 'U'}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-bold text-slate-900 dark:text-white leading-none mb-0.5 truncate">{m.members?.full_name || 'User Tersembunyi'}</span>
                            <span className="text-[7px] text-slate-400 leading-none truncate">{m.members?.email || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isMembOwner && (
                            <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-orange-500/10 text-blue-600 dark:text-orange-500 text-[6px] font-black uppercase rounded-md border border-blue-100 dark:border-orange-500/20 tracking-tighter">OWNER</span>
                          )}
                          {m.slot_role && m.slot_role.trim() !== '' ? (
                            <span className="px-1.5 py-0.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[6px] font-black uppercase rounded-md border border-slate-800 dark:border-slate-200 tracking-tighter">
                              {m.slot_role.toUpperCase()}
                            </span>
                          ) : !isMembOwner && (
                            <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[6px] font-black uppercase rounded-md border border-amber-100 dark:border-amber-900/40 animate-pulse tracking-tighter">PENDING</span>
                          )}
                          {!isMembOwner && member?.user_id === showShareModal.created_by && (
                            <button
                              onClick={() => handleRemoveMember(showShareModal.id, m.user_id)}
                              className="p-1.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 transition-all active:scale-95 ml-1"
                              title="Keluarkan dari Proyek"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="py-6 bg-slate-50 dark:bg-slate-800/10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800/50 flex flex-col items-center justify-center gap-2">
                      <Clock className="w-4 h-4 text-slate-300" />
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center px-4">Memuat data...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-50 dark:border-slate-800 shrink-0 sticky bottom-0 z-10 transition-all">
              <button
                onClick={() => { setShowShareModal(null); setCopied(false); setModalStatus(null); }}
                className="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[9px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all outline-none"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Buat Identitas Proyek */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-5xl shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800 flex flex-col h-auto max-h-[90vh] lg:max-h-[85vh] overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 dark:bg-orange-600 flex items-center justify-center text-white shadow-lg">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Buat Identitas Proyek</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Lengkapi informasi untuk mulai menyusun RAB</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-3 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-2xl transition-all active:scale-90"
              >
                <Plus className="w-6 h-6 rotate-45 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="overflow-y-auto p-8 space-y-6 scrollbar-hide flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="w-4 h-4 text-indigo-600 dark:text-orange-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data Utama</span>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                          Nama Proyek <span className="text-rose-500">*</span>
                        </label>
                        <input
                          required
                          value={createForm.name}
                          onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          placeholder="Contoh: Gedung Sebaguna"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                          ITEM PEKERJAAN <span className="text-rose-500">*</span>
                        </label>
                        <input
                          required
                          value={createForm.work_name || ''}
                          onChange={e => setCreateForm({ ...createForm, work_name: e.target.value })}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          placeholder="Contoh: Rehabilitasi Gedung Kantor"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Program</label>
                        <input
                          value={createForm.program_name}
                          onChange={e => setCreateForm({ ...createForm, program_name: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Kegiatan</label>
                        <input
                          value={createForm.activity_name}
                          onChange={e => setCreateForm({ ...createForm, activity_name: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-orange-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Administrasi</span>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nomor Kontrak</label>
                        <input
                          value={createForm.contract_number}
                          onChange={e => setCreateForm({ ...createForm, contract_number: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                            Thn Anggaran <span className="text-rose-500">*</span>
                          </label>
                          <input
                            required
                            value={createForm.fiscal_year}
                            onChange={e => setCreateForm({ ...createForm, fiscal_year: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                            Pagu (HSP)
                          </label>
                          <input
                            type="number"
                            value={createForm.hsp_value}
                            onChange={e => setCreateForm({ ...createForm, hsp_value: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Durasi Proyek (Hari)</label>
                          <input
                            type="number"
                            value={createForm.manual_duration}
                            onChange={e => setCreateForm({ ...createForm, manual_duration: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                            Wilayah / Regional <span className="text-rose-500">*</span>
                          </label>
                          <LocationSelect
                            value={createForm.location}
                            locationId={createForm.location_id}
                            locations={locations}
                            onChange={(id, name) => setCreateForm({ ...createForm, location_id: id, location: name })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 shrink-0 flex flex-col sm:flex-row gap-4">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all hover:bg-slate-200 border border-slate-200 dark:border-slate-700">Batal</button>
                <button
                  type="submit"
                  disabled={!createForm.name?.trim() || !createForm.fiscal_year?.trim() || !createForm.location?.trim()}
                  className={`flex-[2] py-4 font-black rounded-2xl shadow-xl uppercase tracking-[0.2em] text-xs transition-all ${(!createForm.name?.trim() || !createForm.fiscal_year?.trim() || !createForm.location?.trim())
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-indigo-600 dark:bg-orange-600 text-white hover:scale-[1.02] active:scale-95'
                    }`}
                >
                  Mulai Menyusun RAB
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Identitas Proyek */}
      {isIdentityModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-5xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 dark:bg-orange-600 flex items-center justify-center text-white shadow-lg">
                  <Settings2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Edit Identitas Proyek</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Perbarui meta-data dan detail administratif</p>
                </div>
              </div>
              <button
                onClick={() => setIsIdentityModalOpen(false)}
                className="p-3 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-2xl transition-all active:scale-90"
              >
                <Plus className="w-6 h-6 rotate-45 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleUpdateProjectIdentity} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="overflow-y-auto p-8 space-y-6 scrollbar-hide flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="w-4 h-4 text-indigo-600 dark:text-orange-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data Utama</span>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                          Nama Proyek <span className="text-rose-500">*</span>
                        </label>
                        <input
                          required
                          value={identityForm.name}
                          onChange={e => setIdentityForm({ ...identityForm, name: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                          ITEM PEKERJAAN <span className="text-rose-500">*</span>
                        </label>
                        <input
                          required
                          value={identityForm.work_name || ''}
                          onChange={e => setIdentityForm({ ...identityForm, work_name: e.target.value })}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          placeholder="Contoh: Rehabilitasi Gedung Kantor"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Program</label>
                        <input
                          value={identityForm.program_name}
                          onChange={e => setIdentityForm({ ...identityForm, program_name: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Kegiatan</label>
                        <input
                          value={identityForm.activity_name}
                          onChange={e => setIdentityForm({ ...identityForm, activity_name: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-orange-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Administrasi</span>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nomor Kontrak</label>
                        <input
                          value={identityForm.contract_number}
                          onChange={e => setIdentityForm({ ...identityForm, contract_number: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                            Thn Anggaran <span className="text-rose-500">*</span>
                          </label>
                          <input
                            required
                            value={identityForm.fiscal_year}
                            onChange={e => setIdentityForm({ ...identityForm, fiscal_year: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                            Pagu (HSP)
                          </label>
                          <input
                            type="number"
                            value={identityForm.hsp_value}
                            onChange={e => setIdentityForm({ ...identityForm, hsp_value: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Durasi Proyek (Hari)</label>
                          <input
                            type="number"
                            value={identityForm.manual_duration}
                            onChange={e => setIdentityForm({ ...identityForm, manual_duration: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                            Wilayah / Regional <span className="text-rose-500">*</span>
                          </label>
                          <LocationSelect
                            value={identityForm.location}
                            locationId={identityForm.location_id}
                            locations={locations}
                            onChange={(id, name) => setIdentityForm({ ...identityForm, location_id: id, location: name })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Section Stakeholder & Tanda Tangan ── */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-6">
                    <Users className="w-4 h-4 text-indigo-600 dark:text-orange-500" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Stakeholder & Tanda Tangan Laporan</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* PPK & PPTK */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nama PPK</label>
                        <input
                          value={identityForm.ppk_name}
                          onChange={e => setIdentityForm({ ...identityForm, ppk_name: e.target.value })}
                          placeholder="Pejabat Pembuat Komitmen"
                          className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">NIP PPK</label>
                        <input
                          value={identityForm.ppk_nip}
                          onChange={e => setIdentityForm({ ...identityForm, ppk_nip: e.target.value })}
                          placeholder="NIP: 19..."
                          className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nama PPTK</label>
                        <input
                          value={identityForm.pptk_name}
                          onChange={e => setIdentityForm({ ...identityForm, pptk_name: e.target.value })}
                          placeholder="Pejabat Pelaksana Teknis"
                          className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Konsultan */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nama Perusahaan Konsultan</label>
                        <input
                          value={identityForm.konsultan_name}
                          onChange={e => setIdentityForm({ ...identityForm, konsultan_name: e.target.value })}
                          placeholder="PT. / CV. ..."
                          className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nama Pengawas/Direktur</label>
                        <input
                          value={identityForm.konsultan_supervisor}
                          onChange={e => setIdentityForm({ ...identityForm, konsultan_supervisor: e.target.value })}
                          placeholder="Nama penanda tangan"
                          className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Kontraktor */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nama Direktur Kontraktor</label>
                        <input
                          value={identityForm.kontraktor_director}
                          onChange={e => setIdentityForm({ ...identityForm, kontraktor_director: e.target.value })}
                          placeholder="Nama Pimpinan Komanditer"
                          className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 ring-indigo-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 shrink-0 flex flex-col sm:flex-row gap-4">
                <button type="button" onClick={() => setIsIdentityModalOpen(false)} className="flex-1 py-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all hover:bg-slate-200 border border-slate-200 dark:border-slate-700">Batal</button>
                <button
                  type="submit"
                  disabled={!identityForm.name?.trim() || !identityForm.fiscal_year?.trim() || !identityForm.location?.trim()}
                  className={`flex-[2] py-4 font-black rounded-2xl shadow-xl uppercase tracking-[0.2em] text-xs transition-all ${(!identityForm.name?.trim() || !identityForm.fiscal_year?.trim() || !identityForm.location?.trim())
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-indigo-600 dark:bg-orange-600 text-white hover:scale-[1.02] active:scale-95'
                    }`}
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Hapus Proyek (Enhanced Safety) */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#020617] w-full max-w-md rounded-[32px] border border-red-500/20 shadow-2xl overflow-hidden p-8 text-center ring-1 ring-white/10">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-10 h-10 text-red-500 animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight mb-2">Hapus Proyek Permanen?</h3>
            <p className="text-xs text-slate-400 font-bold leading-relaxed mb-8">
              Tindakan ini <span className="text-red-500 underline">tidak dapat dibatalkan</span>. Seluruh riwayat <span className="text-white">Jadwal</span>,
              riwayat perubahan <span className="text-white">CCO (Addendum)</span>, data <span className="text-white">Mutual Check (MC)</span>,
              progres harian, dan dokumentasi akan dihapus dari server selamanya.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={confirmDelete}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-500/20 transition-all active:scale-95"
              >
                YA, HAPUS SEGALANYA
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="w-full bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
              >
                BATALKAN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProyekPage() {
  return (
    <Suspense fallback={<Spinner full />}>
      <ProyekContent />
    </Suspense>
  );
}
