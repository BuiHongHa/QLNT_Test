function Init_API() {
    return {
        DonVi: "UTC",
        urlNode: 'https://api-apis.com',
        CM: '/csacmapi/api',
        SYS: '/csacmapi/api',
        CMS: '/cmsapi/api',
        DKH: '/dangkyhocapi/api',
        KHCT: '/kehoachchuongtrinhapi/api',
        KS: '/khaosatapi/api',
        KTX: '/kytucxaapi/api',
        NCKH: '/nckhapi/api',
        NS: '/nhansuapi/api',
        D: '/quanlydiemapi/api',
        SV: '/sinhvienapi/api',
        SMS: '/smsapi/api',
        TC: '/taichinhapi/api',
        
        L: '/luongapi/api',
        CC: '/chuyencanapi/api',
        HLTL: '/hoclaithilaiapi/api',
        RL: '/renluyenapi/api',
        XLHV: '/xulyhocvuapi/api',
        HDDT: '/hddtviettelapi/api',
        NH: '/nhaphocapi/api',
        TS: '/quanlytuyensinhapi/api',
        LVLA: '/luanvanluananapi/api',
        QLTTN: '/quanlythitracnghiemapi/api',
        TN: '/totnghiepapi/api',
        TT: '/tintucapi/api',
        TP: '/thiphachapi/api',
        TKGG: '/TKGGAPI/api',
        CTT: '/thanhtoantructuyen/api',
        CTT_PUBLIC: '/thanhtoantructuyen/api',
        QLTTN:  '/ttn.Apis.QuanLyThiTracNghiem.API/api',
        TTN:  '/tn.Apis.ThiTracNghiem.API/api',
	urlKhaoSat: '/congkhaosat/SSOLogin.aspx'
    };
}
//Replace html & js before load. warning 
function ReplicaWithText() {
    return {
        All: {

        },
        ApisCongCanBo: {

        }
    };
}
//replace html after load
function ReplicaWithDom() {
    return {
        All: {
            ".cosoxet": "trường."//
        },
        ApisCongCanBo: {
        }
    };
}
