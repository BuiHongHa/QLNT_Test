function UploadFile(arrZoneId, strModule_Name, strFolder, strFolderExtend, callback) {
    //in html: <div id="uploadPicture_PN"></div>
    //in js: edu.system.singleFileUp(["uploadPicture_PN"], "");
    var me = edu.system;
    if (me == undefined) {
        alert("Chưa load được file systemroot");
        return;
    }

    var strLinkUpload = me.rootPathUpload;
    if (!edu.util.checkValue(strFolderExtend)) {
        strFolderExtend = "";
    }
    //if (!edu.util.checkValue(arrZoneId)) {
    //    me.alert("Chưa truyền vào arrZoneId", "w");
    //    return false;
    //}
    var strOutFolderPath = "";
    if (edu.util.checkValue(strModule_Name)) {
        strOutFolderPath += strModule_Name + "/";
    }
    if (edu.util.checkValue(strFolder)) {
        strOutFolderPath += strFolder + "/";
    }
    if (edu.util.checkValue(strFolderExtend)) {
        strOutFolderPath += strFolderExtend + "/";
    }

    //Kiểm tra id file có tồn tại không
    for (var i = 0; i < arrZoneId.length; i++) {
        var temp = arrZoneId[i];
        //Nếu file chứa dấu : kiểm tra xem có tồn tại id đó không
        if (temp.includes(":")) {
            if (document.getElementById(temp.substring(0, temp.indexOf(":"))) == undefined) {
                //me.alert("Không tồn tại id: " + temp, "w");
                continue;
            }
        }
        else {
            if (document.getElementById(temp) == undefined) {
                //me.alert("Không tồn tại id: " + temp, "w");
                continue;
            }
        }
    }
    var arrMulFileUp = [];// Mảng 2 chiều [["newFileName1", "FileName2"],["newFileName1", "FileName2"]]
    var loadFileSuccess = 0; //Lưu tình trạng tải file: 0 có thể gửi, 1 đang tải file đính kèm lên server, 2 đã hoàn thành tải file lên server
    //Thêm thư viện
    var row = "";
    row += '<link href="' + strLinkUpload + '/Core/jquery-ui.structure.min.css" rel="stylesheet" />';
    row += '<link href="' + strLinkUpload + '/Core/jquery-ui.theme.min.css" rel="stylesheet" />';
    $(me.ctPlacehoder).append(row);
    uploadFile(arrZoneId);
    
    function uploadFile(arrFile) {
        for (var i = 0; i < arrFile.length; i++) {
            eventUpload(arrFile[i]);
        }
    }

    function eventUpload(elementId) {
        var strZoneFileDinhKem = "";
        //Nếu file chứa dấu : tức là có zone upload riêng
        if (elementId.includes(":")) {
            strZoneFileDinhKem = elementId.substring(elementId.indexOf(":") + 1);
            elementId = elementId.substring(0, elementId.indexOf(":"));
        }
        else {
            strZoneFileDinhKem = "zoneFileDinhKem" + elementId;
        }
        var row = "";
        row += '<input id="divupload' + elementId + '" type="image" src="' + strLinkUpload + '/Core/images/file_add.png" value="Upload" />';
        //row += '<input id="uploader' + elementId + '" multiple="multiple" type="file" style="display: none">';
        row += '<textarea id="' + elementId + '" style="display: none"></textarea>';
        row += '<div class="clear"></div>';
        row += '<div id="zoneFileDinhKem' + elementId + '"></div>';
        row += '<div class="clear"></div>';
        row += ' <div id="progress-bar' + elementId + '" style="position: relative; display: none">';
        row += '<span id="progressbar-label' + elementId + '" class="progressbar-effect">Please Wait...</span>';
        row += '</div>';
        $("#" + elementId).replaceWith("<div id='zoneFileUp" + elementId + "'>" + row + "</div>");
        //Sự kiện khi nhấn 
        var strUuid = edu.util.uuid();
        $("#divupload" + elementId).click(function (e) {
            e.preventDefault();
            $("#uploader" + strUuid).remove();
            strUuid = edu.util.uuid();
            $("#zoneFileUp" + elementId).append('<input id="uploader' + strUuid + '" multiple="multiple" type="file" style="display: none">');
            document.getElementById("uploader" + strUuid).addEventListener("change", function () {
                upLoadFiles(elementId, strZoneFileDinhKem, 0, strUuid);
            });
            $("#uploader" + strUuid).trigger("click");
        });


        //Sự kiến xóa file khi click vào nút xóa tại mỗi ô file upload
        $(document).delegate(".btnDeleteFileUp" + elementId, "click", function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var point = this;
            if (me.iNewLogin) {
                var pointNode = point.parentNode;
                if (pointNode != null) $(pointNode).remove();
            } else {
                var pointNode = point.parentNode;
                while (pointNode != null && pointNode.nodeName != "LI") {
                    pointNode = pointNode.parentNode;
                }
                if (pointNode != null) $(pointNode).remove();
            }
            
            
            outThongTinDinhKem(elementId);
        });
        
    }

    function upLoadFiles(elementId, strZoneUp, i, strUuid) {
        console.log(1111111);
        //Cập nhật trạng thái đang up file
        loadFileSuccess = 1;
        console.log(elementId + "2222");
        var uploadedFiles = $('#uploader' + strUuid)[0].files;
        //Chứa danh sách tên file cho lần upload hiện tại trên giao diện
        var arrFileName = [];
        //var arrData = [];
        //Lấy lại danh sách file bao gồm file lưu dưới db và tên file hiển thị
        arrMulFileUp = getDSFile(elementId);
        //Chỉnh sửa lại arrMulFileUp
        var formData = new FormData();
        //Maxsize = 4M;
        var iTongSize = 0;
        //Số file select trên giao diện
        if (uploadedFiles.length > 0) {
            //Kiểm tra sự trùng lặp file khi upload
            for (i; i < uploadedFiles.length; i++) {
                var icheck = true;
                for (var j = 0; j < arrMulFileUp.length; j++) {
                    //Kiểm tra dự vào file name
                    if (uploadedFiles[i].name == arrMulFileUp[j][1]) icheck = false;
                }
                if (icheck) {
                    //Kiểm tra đuôi file
                    var strFileName = uploadedFiles[i].name;
                    var vitri = strFileName.lastIndexOf(".");
                    var strExtensionFile = strFileName.substring(vitri + 1);
                    var strCheck = checkFileImport(strExtensionFile);
                    if (strCheck == "") {
                        me.alert("File <b>" + strFileName + "</b> không hợp lệ!", 'w');
                        return;
                    }
                    if (uploadedFiles[i].size > 2147483647) {
                        me.alert("File: <b>" + strFileName + "</b> vượt quá dung lượng cho phép");
                        continue;
                    }
                    iTongSize += uploadedFiles[i].size;
                    if (iTongSize > 2147483647) {
                        makeRequest(arrFileName, formData, elementId, strZoneUp, i);
                        return;
                    }
                    formData.append(strFileName, uploadedFiles[i]);
                    arrFileName.push(strFileName);
                }
                //if ((i + 1) % 1 == 0) {
                //    makeRequest(arrFileName, formData, elementId, strZoneUp, i);
                //    return;
                //}
            }
        }
        else {
            me.alert("Bạn chưa chọn file nào!", 'w');
            return;
        }
        if (i > 20) me.alert("Hoàn tất tải file lên server");
        makeRequest(arrFileName, formData, elementId, strZoneUp, -1);
    }

    function makeRequest(arrFileName, formData, elementId, strZoneUp, iViTriDung) {
        //Kiểm tra nếu không có new file thoát ra
        if (arrFileName.length <= 0 && iViTriDung == -1) {
            //me.alert("Không có file nào mới!", 'w');
            return;
        }

        var progressbarLabel = $('#progressbar-label' + elementId);
        var progressbarDiv = $('#progress-bar' + elementId);
        $.ajax
            ({
                url: strLinkUpload + "/Handler/up_files_v2.ashx?outFolderPath=" + strOutFolderPath+"&userId=" + edu.system.userId,
                method: 'POST',
                contentType: false,
                processData: false,
                data: formData,
                success: function (response) {
                    //Cập nhật trạng thái load thành công
                    loadFileSuccess = 2;
                    //Thông báo lỗi khi response trả về có chứa "Sys_error: "
                    if (response.includes('Sys_error: ')) {
                        me.alert(response, 'w');
                        return;
                    }
                    progressbarLabel.text('Tải lên server thành công!', 'w');
                    if (arrFileName.length > 1) {
                        var arrfile = response.split(",");
                        if (arrfile.length != arrFileName.length) {
                            me.alert("File đính kèm không hợp lệ. Vui lòng thử lại", "w");
                            return;
                        }
                        for (var i = 0; i < arrfile.length; i++) {
                            arrMulFileUp.push([arrfile[i], arrFileName[i]]);
                        }
                    }
                    else {
                        if (arrFileName.length > 0) arrMulFileUp.push([response, arrFileName[0]]);
                    }
                    viewFileDinhKem(elementId, strZoneUp);

                    if (!me.iNewLogin)
                    progressbarDiv.fadeOut(2000);
                    if (iViTriDung != -1) setTimeout(function () { upLoadFiles(elementId, strZoneUp, iViTriDung); }, 2000);
                    //Thông báo
                },
                error: function (err) {
                    loadFileSuccess = 2;
                    me.alert(err.statusText);
                }
            });
            progressbarLabel.text('Vui lòng chờ đợi...');

            if (!me.iNewLogin)
            progressbarDiv.progressbar({
                value: false
            }).fadeIn(1000);
    }

    function viewFileDinhKem(elementId, strZoneUp) {
        
        var row = '';
        var arrketqua = '';
        var x = document.getElementsByClassName("btnDeleteFileUp" + elementId);
        for (var i = 0; i < x.length; i++) arrketqua += x[i].title + ",";

        for (var i = 0; i < arrMulFileUp.length; i++) {
            //Hiện thị hình ảnh đuôi mở rộng
            var strFileName = arrMulFileUp[i][1];
            var strFileNameInStorage = arrMulFileUp[i][0];
            //Nếu là file đã up thoát khỏi
            if (arrketqua.includes(strFileNameInStorage)) continue;
            //Lấy phần đuôi mở rộng để hiển thị file
            vitri = strFileNameInStorage.lastIndexOf(".");
            var strExtensionFile = strFileNameInStorage.substr(vitri + 1, strFileNameInStorage.length);

            var strColor = "black";
            var strFileStyle = "fa fa-file";
            strFileStyleNew = "fa fa-file";

            switch (strExtensionFile.trim()) {
                case "jpg":
                case "png":
                case "jpeg":
                case "gif":
                    strFileStyle = "fa fa-file-image-o";
                    strFileStyleNew = "fal fa-file-image";
                    strColor = "pink";
                    break;
                case "doc":
                case "docx":
                    strFileStyle = "fa fa-file-word-o";
                    strFileStyleNew = "fal fa-file-word";
                    strColor = "blue";
                    break;
                case "xls":
                case "xlsx":
                    strFileStyle = "fa fa-file-excel-o";
                    strFileStyleNew = "fal fa-file-excel";
                    strColor = "green";
                    break;
                case "pdf":
                    strFileStyle = "fa fa-file-pdf-o";
                    strFileStyleNew = "fal fa-file-pdf";
                    strColor = "red";
                    break;
                case "rar":
                    strFileStyle = "fa fa-file-archive-o";
                    strFileStyleNew = "fa fa-file-archive";
                    strColor = "purple";
                    break;
            }
            var content = '';
            if (strExtensionFile == "jpg" || strExtensionFile == "png" || strExtensionFile == "png" || strExtensionFile == "png") {
                var pictureUp = strLinkUpload + "/" + strFileNameInStorage;
                content = '<img class="user-image upload-img poiter" name="' + strFileNameInStorage + '" src="' + pictureUp + '"/>';
            }
            else {
                content += '<i style="color: ' + strColor + '" class="' + strFileStyle + ' upload-file poiter" name="' + strFileNameInStorage + '" title="' + strFileName + '"></i>';
            }
            if (me.iNewLogin) {
                if (strExtensionFile === "jpg" || strExtensionFile === "png" || strExtensionFile === "png" || strExtensionFile === "png") {
                    pictureUp = me.rootPathUpload + "/" + strFileNameInStorage;
                    row += '<div class="file-upload"  style="cursor: pointer">';
                    row += '<img class="upload-img" name="' + strFileNameInStorage + '" src="' + pictureUp + '"/>';
                }
                else {
                    row += '<div class="file-upload file-data" style="cursor: pointer">';
                    row += '<a class="file-w-e upload-file"  name="' + strFileNameInStorage + '"><i class="' + strFileStyleNew + '"></i>';
                    row += '<span class="upload-file"  name="' + strFileNameInStorage + '">' + strFileName + '</span></a>';
                }
                row += '<a class="btn btn-default btn-delete-file btnDeleteFileUp' + elementId + '" name="" title="' + strFileNameInStorage + '" filename="' + strFileName + '" href="#"><i class="fa fa-times-circle"></i></a>';
                row += '</div>';
            }
            else
            {

                row += '<li>';
                row += '<span class="mailbox-attachment-icon">';
                row += content;
                row += '<a class="btn btn-default btn-xs pull-right btnDeleteFileUp' + elementId + '" name="" title="' + strFileNameInStorage + '" filename="' + strFileName + '" href="#">';
                row += '<i class="fa fa-times-circle"></i>';
                row += '</a>';
                row += '</span>';
                row += '<div class="mailbox-attachment-info">';
                row += '<div class="mailbox-attachment-name" href="#" title="' + strFileName + '">';
                row += strFileName;
                row += '</div>';
                row += '</div>';
                row += '</li>';
            //Cập nhật danh sách file upload
            }
        }
        if (me.iNewLogin) $("#" + strZoneUp).append(row);
        else 
        $("#" + strZoneUp).append('<ul class="mailbox-attachments">' + row + '</ul>');
        outThongTinDinhKem(elementId, callback);
    }
    
    function getDSFile(elementId) {
        var arrTemp = [];
        var x = document.getElementsByClassName("btnDeleteFileUp" + elementId);
        for (var i = 0; i < x.length; i++) {
            var point = x[i];
            arrTemp.push([$(point).attr("title"), $(point).attr("filename")]);
        }
        return arrTemp;
    }

    function checkFileImport(extention) {
        extention = extention.toLowerCase();
        //Kiểm tra những file được phép đi xuống
        //Dưới file server cũng check lại như vậy
        var check = me["strTypeCheckFile"] ? me["strTypeCheckFile"] : ".csv.doc.docx.djvu.odp.ods.odt.pps.ppsx.ppt.pptx.pdf.ps.eps.rtf.txt.wks.wps.xls.xlsx.xps.svg.7z.zip.rar.jar.tar.tar.gz.cab.bmp.exr.gif.ico.jp2.jpeg.pbm.pcx.pgm.png.ppm.psd.tiff.tga.jpg.3gp.avi.flv.m4v.mkv.mov.mp4.mpeg.ogv.wmv.webm.aac.ac3.aiff.amr.ape.au.flac.m4a.mka.mp3.mpc.ogg.ra.wav.wma.chm.epub.fb2.lit.lrf.mobi.pdb.rb.tcr";// định dạng text
        var strTypeOfFile = "";
        if (check.includes('.' + extention)) strTypeOfFile = "text";
        //else {
        //    check = "";// định dạng file nén
        //    if (check.includes('.' + extention)) strTypeOfFile = "file";
        //    else {
        //        check = ".bmp.exr.gif.ico.jp2.jpeg.pbm.pcx.pgm.png.ppm.psd.tiff.tga.jpg";// định dạng ảnh
        //        if (check.includes('.' + extention)) strTypeOfFile = "picture";
        //        else {
        //            check = ".3gp.avi.flv.m4v.mkv.mov.mp4.mpeg.ogv.wmv.webm";// định dạng video
        //            if (check.includes('.' + extention)) strTypeOfFile = "video";
        //            else {
        //                check = ".aac.ac3.aiff.amr.ape.au.flac.m4a.mka.mp3.mpc.ogg.ra.wav.wma";// định dạng audio
        //                if (check.includes('.' + extention)) strTypeOfFile = "audio";
        //                else {
        //                    check = ".chm.epub.fb2.lit.lrf.mobi.pdb.rb.tcr";// định dạng sách
        //                    if (check.includes('.' + extention)) strTypeOfFile = "book";
        //                }
        //            }
        //        }
        //    }
        //}
        return strTypeOfFile;
    }
}

function outThongTinDinhKem(elementId, callback) {
    var row = "";
    var x = document.getElementsByClassName("btnDeleteFileUp" + elementId);
    for (var i = 0; i < x.length; i++) row += x[i].title + ",";
    row = row.substring(0, row.length - 1);
    $("#" + elementId).val(row);
    if (typeof (callback) == 'function') {
        callback(elementId, row);
    }
}

function checkFileAvailable(strFileName) {
    if (strFileName == "") return;
    $.ajax({
        url: edu.system.rootPathUpload + '/Handler/checkFileAvailable.ashx?strFileName=' + strFileName,
        method: 'post',
        success: function (data) {
            if (data == "404") {
                var point = $('.btnDelUploadedFile[title="' + strFileName + '"]').parent();
                if (point.find("img").length > 0) {
                    point.find("img").replaceWith('<i class="fa fa-exclamation-triangle" style="color: orange" ></i>');
                } else {
                    point.find("i").replaceWith('<i class="fa fa-exclamation-triangle" style="color: orange" ></i>');
                }
            }
        }
    });
}

function deleteFiles(strFiles, callback) {
    var me = edu.system;
    var arrFiles = edu.util.convertStrToArr(strFiles, ",");
    for (var i = 0; i < arrFiles.length; i++) {
        strFileName = arrFiles[i];
        deleteFile(arrFiles[i]);
    }
    function deleteFile(strFileName) {
        var point = $('.btnDelUploadedFile[title="' + strFileName + '"]');
        if (point.length == 0) {
            point = $('.btnDelUploadedFile[title="' + strFileName.replace(/\\/g, '\\\\') + '"]');
        }
        point = point.parent();
        if (!me.iNewLogin) point = point.parent();
        //Lấy vị trí biến lưu kết quả trả vể
        var elementId = point.parent().parent().parent().find("textarea").attr("id");
        outThongTinDinhKem(elementId);
        point.replaceWith("");
        obj = {
            title: "",
            content: "Xóa dữ liệu thành công!",
            code: ""
        };
        edu.system.afterComfirm(obj);
        if (typeof (callback) == "function") {
            callback(data);
        }
    }
}

function viewFile(elementId, json, callback) {
    var me = edu.system;
    var arrFileName = [];
    var arrTenHienThi = [];
    var arrId = [];
    var strZoneUp = elementId;

    for (var i = 0; i < json.length; i++) {
        var strFileName = json[i].FILEMINHCHUNG;
        if (strFileName == null) continue;
        var strTenHienThi = json[i].TENHIENTHI;
        if (strTenHienThi == null) strTenHienThi = strFileName.substring(strFileName.lastIndexOf("/") + 1);

        arrId.push(json[i].ID);
        arrFileName.push(strFileName);
        arrTenHienThi.push(strTenHienThi);
    }
    //Kiểm tra tồn tại của zone upload nếu là undifine tức từ zone chỉ view file
    var checkViewFile = document.getElementById("zoneFileUp" + elementId);
    if (checkViewFile != undefined) {
        $("#" + elementId).val(arrFileName.toString());
        var strZoneUp = "zoneFileDinhKem" + elementId;
    }
    //bắt đầu hiện thị file
    $("#" + strZoneUp).html("");
    var row = '';

    if (arrId.length > 0) {
        var strTenHienThi = "";
        var strFileNameInStorage = "";
        var strExtensionFile = "";
        var content = "";
        var strColor = "";
        var strFileStyle = "";
        var pictureUp = "";
        for (var i = 0; i < arrId.length; i++) {
            if (!edu.util.checkValue(arrFileName[i])) continue;
            //
            var strId = arrId[i];
            //Hiện thị hình ảnh đuôi mở rộng
            strTenHienThi = arrTenHienThi[i].substring(arrTenHienThi[i].lastIndexOf("/") + 1);
            strFileNameInStorage = arrFileName[i];
            //Nếu là file rỗng thoát khỏi
            if (strFileNameInStorage == "") continue;
            //Lấy phần đuôi mở rộng để hiển thị file
            vitri = strFileNameInStorage.lastIndexOf(".");
            strExtensionFile = strFileNameInStorage.substring(vitri + 1);
            strColor = "black";
            strFileStyle = "fa fa-file";
            strFileStyleNew = "fa fa-file";

            switch (strExtensionFile.trim()) {
                case "jpg":
                case "png":
                case "jpeg":
                case "gif":
                    strFileStyle = "fa fa-file-image-o";
                    strFileStyleNew = "fal fa-file-image";
                    strColor = "pink";
                    break;
                case "doc":
                case "docx":
                    strFileStyle = "fa fa-file-word-o";
                    strFileStyleNew = "fal fa-file-word";
                    strColor = "blue";
                    break;
                case "xls":
                case "xlsx":
                    strFileStyle = "fa fa-file-excel-o";
                    strFileStyleNew = "fal fa-file-excel";
                    strColor = "green";
                    break;
                case "pdf":
                    strFileStyle = "fa fa-file-pdf-o";
                    strFileStyleNew = "fal fa-file-pdf";
                    strColor = "red";
                    break;
                case "rar":
                    strFileStyle = "fa fa-file-archive-o";
                    strFileStyleNew = "fa fa-file-archive";
                    strColor = "purple";
                    break;
            }
            if (strExtensionFile === "jpg" || strExtensionFile === "png" || strExtensionFile === "png" || strExtensionFile === "png") {
                pictureUp = me.rootPathUpload + "/" + strFileNameInStorage;
                content = '<img class="user-image upload-img poiter" name="' + strFileNameInStorage + '" src="' + pictureUp + '" title="' + strTenHienThi + '" />';
            }
            else {
                content = '<i style="color: ' + strColor + '" class="' + strFileStyle + ' upload-file poiter" name="' + strFileNameInStorage + '" title="' + strTenHienThi + '"></i>';
            }
            if (me.iNewLogin) {
                if (strExtensionFile === "jpg" || strExtensionFile === "png" || strExtensionFile === "png" || strExtensionFile === "png") {
                    pictureUp = me.rootPathUpload + "/" + strFileNameInStorage;
                    row += '<div class="file-upload" style="cursor: pointer">';
                    row += '<img class="upload-img" name="' + strFileNameInStorage + '" src="' + pictureUp + '"/>';
                }
                else {
                    row += '<div class="file-upload file-data"  style="cursor: pointer">';
                    row += '<a class="file-w-e upload-file"  name="' + strFileNameInStorage + '"><i class="' + strFileStyleNew + '"></i>';
                    row += '<span class="upload-file"  name="' + strFileNameInStorage + '">' + strTenHienThi + '</span></a>';
                }
                if (checkViewFile != undefined) {
                    row += '<a class="btn btn-default btn-delete-file btnDelUploadedFile" name="' + strId + '" title="' + strFileNameInStorage + '" filename="' + strTenHienThi + '"><i class="fa fa-times-circle"></i></a>';
                }
                row += '</div>';
            } else {
                row += '<li>';
                row += '<span class="mailbox-attachment-icon">';
                row += content;
                //Bỏ nút xóa nếu chỉ là view file
                if (checkViewFile != undefined) {
                    row += '<a class="btn btn-default btn-xs pull-right btnDelUploadedFile" name="' + strId + '" title="' + strFileNameInStorage + '" filename="' + strTenHienThi + '">';
                    row += '<i class="fa fa-times-circle"></i>';
                    row += '</a>';
                }
                row += '</span>';
                row += '<div class="mailbox-attachment-info">';
                row += '<div class="mailbox-attachment-name" href="#" title="' + strTenHienThi + '">';
                row += strTenHienThi;
                row += '</div>';
                row += '</div>';
                row += '</li>';
            }
            
            //Cập nhật danh sách file upload
        }
        if (me.iNewLogin) $("#" + strZoneUp).append(row);
        else 
        $("#" + strZoneUp).append('<ul class="mailbox-attachments">' + row + '</ul>');
        setTimeout(function () {
            for (var i = 0; i < arrFileName.length; i++) {
                checkFileAvailable(arrFileName[i]);
            }
        }, 1000);
    }
    if (typeof (callback) == "function") {
        callback(arrFileName.toString());
    }
}

$("#main-content-wrapper").delegate(".upload-file", "click", function (e) {
    e.stopImmediatePropagation();
    var strLink = $(this).attr("name");
    if (edu.util.checkValue(strLink)) {
        window.open(edu.system.rootPathUpload + "/" + strLink);
    }
});
$("#main-content-wrapper").delegate(".upload-img", "click", function (e) {
    e.stopImmediatePropagation();
    var me = edu.system;
    var strLink = $(this).attr("name");
    if (edu.util.checkValue(strLink)) {
        genBox_Alert();
        //var box = '';
        //box += '<div class="modal fade" id="myModal_Preview" role="dialog" aria-labelledby="myModalLabel" aria-hidden="true">';
        //box += '< div class="modal-dialog" >';
        //box += '<div class="modal-content">';
        //box += '<div class="modal-header">';
        //box += '<button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button>';
        //box += '<h4 class="modal-title modal-name"><i class="fa fa-eye"></i></h4>';
        //box += '<input type="hidden" value="" id="txtIdTCQG" />';
        //box += '</div>';
        //box += '<div class="modal-body" id="capnhatthongtin">';
        //box += '<iframe src="' + edu.system.rootPathUpload + '/' + strLink + '" frameborder="0" style="display:block; width:100%; height:70vh;"></iframe>';
        //box += '</div>';
        //box += '</div>';
        //box += '</div >';
        //box += '</div >';

        //$("#alert").html(box);
        //$('#alert>#myModal_Preview').modal('show');
    }

    function genBox_Alert() {
        if (!me.flag_alert) {
            alert += '<div id="myModalAlert" class="modal fade modal-alert" role="dialog" style=""><div class="modal-dialog">';
            alert += '<div class="modal-content" style="width: 800px;"><div class="modal-header">';
            alert += '<button type="button" class="close" data-dismiss="modal" data-bs-dismiss="modal"><span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button>';
            //alert += '<h4 class="modal-title">Thông báo</h4>';
            alert += ' </div>';
            alert += '<div class="modal-body" id="alert_content">';
            alert += '</div>';
            alert += '<div class="modal-footer">';
            alert += '<button type="button" class="btn btn-default" data-dismiss="modal" data-bs-dismiss="modal"><i class="fa fa-times-circle"></i> ' + edu.constant.getting("BUTTON", "CLOSE") + '</button>';
            alert += '</div>';
            alert += '</div>';

            $("#alert").html(alert);
            $('#alert>#myModalAlert').modal('show');
            genContent_Alert();
            me.flag_alert = true;

            $("#btnYes").hide();

            $('#myModalAlert').on('hidden.bs.modal', function () {
                $("#myModalAlert").remove();
                me.flag_alert = false;
                me.arrcheckcontent = [];
                me.arrStt = [];
            });

        }
        else {
            genContent_Alert();
        }
    }
    function genContent_Alert() {
        $('#myModalAlert #alert_content').append('<iframe src="' + me.rootPathUpload + '/' + strLink + '" frameborder="0" style="display:block; width:100%; height:70vh;"></iframe>');
    }
});